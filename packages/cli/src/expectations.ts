import { join } from "node:path";
import {
  childPath,
  Diagnostics,
  type FileDiagnostic,
  type JsonNode,
  parseJson,
} from "@legacycodehq/dxn-language";
import { readSource } from "./compiler/read.js";
import {
  checkSchema,
  checkVersion,
  expectKind,
  expectName,
  expectNonEmptyString,
  expectObject,
  keys,
  report,
} from "./compiler/shape.js";
import { uses } from "./compiler/transitions.js";
import { contextFilter, QueryError, sharedStates, subtreeContexts } from "./queries.js";
import type { Context, Resolver } from "./resolve.js";
import { profileLabel } from "./tables.js";

const file = "expectations.json";

// expectations.json: what the model should say, checked once the rest of the
// project compiles. Each expectation selects contexts like `contexts` does (a
// node, optionally its whole subtree, in a root, filtered with when) and makes
// one assertion: then (every one has these values), some (at least one has
// them) or exists (the node is there, or not, wherever when holds).
export function checkExpectations(project: string, resolver: Resolver): FileDiagnostic[] {
  const read = readSource(join(project, file));
  if (!read.ok) {
    return read.code === "missing-file"
      ? []
      : [
          {
            file,
            code: read.code,
            message: read.message,
            path: "$",
            line: read.line,
            column: read.column,
          },
        ];
  }
  const parsed = parseJson(read.source);
  const diagnostics = new Diagnostics(read.source);
  diagnostics.items.push(...parsed.diagnostics);
  if (parsed.root !== undefined) {
    checkFile(diagnostics, resolver, parsed.root);
  }
  return diagnostics.items.map((diagnostic) => ({ file, ...diagnostic }));
}

function checkFile(
  diagnostics: Diagnostics,
  resolver: Resolver,
  root: Parameters<typeof expectObject>[1],
): void {
  const document = expectObject(diagnostics, root, "$");
  if (document === undefined) return;
  const members = keys(diagnostics, document, "$", ["$schema", "version", "expectations"], {
    required: ["version", "expectations"],
  });
  checkSchema(diagnostics, members.get("$schema"));
  checkVersion(diagnostics, members.get("version"));
  const list = members.get("expectations");
  if (list === undefined || !expectKind(diagnostics, list, "$.expectations", "array")) return;

  list.elements.forEach((item, index) => {
    const path = `$.expectations[${index}]`;
    const expectation = expectObject(diagnostics, item, path);
    if (expectation === undefined) return;
    const fields = keys(
      diagnostics,
      expectation,
      path,
      ["title", "node", "subtree", "root", "when", "on", "then", "some", "exists"],
      { required: ["title", "node"] },
    );
    let valid = true;

    const title = fields.get("title");
    if (title === undefined || !expectNonEmptyString(diagnostics, title, `${path}.title`))
      valid = false;
    const named = title?.kind === "string" ? title.value : "expectation";

    const node = fields.get("node");
    let id: string | undefined;
    if (node !== undefined && expectName(diagnostics, node, `${path}.node`)) {
      if (resolver.node(node.value) === undefined) {
        report(
          diagnostics,
          "unknown-node",
          `node ${JSON.stringify(node.value)} does not exist`,
          `${path}.node`,
          node,
        );
      } else {
        id = node.value;
      }
    }

    const subtree = fields.get("subtree");
    if (subtree !== undefined && !expectKind(diagnostics, subtree, `${path}.subtree`, "boolean"))
      valid = false;

    const rootNode = fields.get("root");
    let root: string | undefined;
    if (rootNode !== undefined && expectName(diagnostics, rootNode, `${path}.root`)) {
      if (id !== undefined && !resolver.roots(id).includes(rootNode.value)) {
        report(
          diagnostics,
          "node-outside-root",
          `node ${JSON.stringify(id)} is not in root ${JSON.stringify(rootNode.value)}`,
          `${path}.root`,
          rootNode,
        );
        valid = false;
      }
      root = rootNode.value;
    }

    // when: name -> a value, or a list of values any of which matches.
    const when = values(diagnostics, fields.get("when"), `${path}.when`, true);
    if (when === undefined) valid = false;

    // Exactly one assertion.
    const assertions = assertionKeys.filter((key) => fields.has(key));
    if (assertions.length === 0) {
      report(
        diagnostics,
        "missing-key",
        'give one assertion: "then", "some" or "exists"',
        path,
        expectation,
      );
      return;
    }
    if (assertions.length > 1) {
      report(
        diagnostics,
        "several-assertions",
        `an expectation makes one assertion: "then", "some" or "exists", not ${assertions.map((key) => JSON.stringify(key)).join(" and ")}`,
        path,
        expectation,
      );
      return;
    }
    const kind = assertions[0] as (typeof assertionKeys)[number];
    const assertionNode = fields.get(kind) as JsonNode;
    const assertionPath = `${path}.${kind}`;
    const onNode = fields.get("on");
    if (onNode !== undefined) {
      if (kind !== "then") {
        report(diagnostics, "unknown-key", '"on" goes only with "then"', `${path}.on`, onNode);
        return;
      }
      if (!valid || id === undefined) return;
      checkTransitionRule(diagnostics, resolver, {
        id,
        named,
        path,
        whenNode: fields.get("when"),
        onNode,
        thenNode: assertionNode,
        expectation,
      });
      return;
    }
    let asserted: [string, string[]][] | undefined;
    let attributes: [string, string[]][] = [];
    let exists: boolean | undefined;
    if (kind === "exists") {
      if (expectKind(diagnostics, assertionNode, assertionPath, "boolean")) {
        exists = assertionNode.value;
      } else {
        valid = false;
      }
    } else {
      const parsed = assertion(diagnostics, resolver, assertionNode, assertionPath);
      if (parsed === undefined) valid = false;
      asserted = parsed?.pairs;
      attributes = parsed?.attributes ?? [];
    }

    if (!valid || id === undefined || when === undefined) return;
    const whenNode = fields.get("when");
    const describeWhen =
      when.length === 0
        ? ""
        : ` (${when.map(([name, list]) => `${name}=${list.join("|")}`).join(", ")})`;

    if (kind === "exists") {
      checkExists(diagnostics, resolver, {
        id,
        root,
        when,
        exists: exists as boolean,
        named,
        describeWhen,
        whenNode,
        path,
        assertionNode,
        assertionPath,
        expectation,
      });
      return;
    }

    // The contexts the expectation is about, with the node each belongs to.
    const all: { node: string; context: Context; root: string | undefined }[] =
      subtree?.kind === "boolean" && subtree.value
        ? subtreeContexts(resolver, id, root).flatMap((part) =>
            part.contexts.map((context) => ({ node: part.id, context, root })),
          )
        : (root === undefined ? resolver.roots(id) : [root]).flatMap((inRoot) =>
            resolver
              .contexts(id, inRoot)
              .map((context) => ({ node: id as string, context, root: inRoot })),
          );
    // Why a context's states break the attribute values asserted, if they do.
    const attributeProblem = (owner: string, context: Context, inRoot: string | undefined) => {
      const resolved = resolver.resolve(owner, context, resolver.lineage(owner, inRoot));
      const states = Object.keys(resolved.groups)
        .map((group) => context[group])
        .filter((state): state is string => state !== undefined);
      for (const [attribute, allowed] of attributes) {
        for (const state of states) {
          const value = resolved.attributes[attribute]?.[state];
          if (value === undefined)
            return `${attribute}=${allowed.join("|")}: ${attribute} is not set for ${state}`;
          if (!allowed.includes(value))
            return `${attribute}=${allowed.join("|")}: ${state} has ${attribute}=${value}`;
        }
      }
      return undefined;
    };
    const contexts = all.map(({ context }) => context);
    const filter = (pairs: [string, string][], at: JsonNode | undefined, atPath: string) => {
      try {
        return contextFilter(resolver, pairs, contexts, root);
      } catch (error) {
        if (!(error instanceof QueryError)) throw error;
        report(
          diagnostics,
          error.field === "name" ? "unknown-name" : "unknown-value",
          error.message,
          atPath,
          at ?? expectation,
        );
        return undefined;
      }
    };
    // Each name keeps the contexts with any of its values.
    const byName = when.map(([name, list]) =>
      list.map((value) => filter([[name, value]], whenNode, `${path}.when`)),
    );
    const keep = byName.flat().includes(undefined)
      ? undefined
      : (context: Context) =>
          byName.every((predicates) =>
            predicates.some((predicate) => (predicate as (c: Context) => boolean)(context)),
          );
    const pairs = (asserted ?? []).flatMap(([name, list]) =>
      list.map((value) => [name, value] as [string, string]),
    );
    if (keep === undefined || filter(pairs, assertionNode, assertionPath) === undefined) return;

    const matches = (context: Context, name: string, list: string[]) =>
      list.some((value) =>
        name === "profile"
          ? (contextFilter(resolver, [[name, value]], contexts, root) as (c: Context) => boolean)(
              context,
            )
          : context[name] === value,
      );
    const selected = all.filter(({ context }) => keep(context));
    const hasStates = (owner: string, context: Context, inRoot: string | undefined) =>
      Object.keys(resolver.resolve(owner, context, resolver.lineage(owner, inRoot)).groups).length >
      0;
    const relevant = selected.filter(
      ({ node: owner, context, root: inRoot }) =>
        (asserted ?? []).some(([name]) => name === "profile" || context[name] !== undefined) ||
        (attributes.length > 0 && hasStates(owner, context, inRoot)),
    );
    if (relevant.length === 0) {
      report(
        diagnostics,
        "empty-expectation",
        `${named}: selects no contexts of ${id}${describeWhen}`,
        whenNode === undefined ? path : `${path}.when`,
        whenNode ?? expectation,
      );
      return;
    }
    if (kind === "then") {
      for (const { node: owner, context, root: inRoot } of relevant) {
        const broken = (asserted ?? []).find(
          ([name, list]) =>
            (name === "profile" || context[name] !== undefined) && !matches(context, name, list),
        );
        const problem =
          broken !== undefined
            ? `${broken[0]}=${broken[1].join("|")}`
            : attributes.length > 0 && hasStates(owner, context, inRoot)
              ? attributeProblem(owner, context, inRoot)
              : undefined;
        if (problem !== undefined) {
          report(
            diagnostics,
            "expectation-failed",
            `${named}: ${describeContext(resolver, owner, context)} breaks ${problem}`,
            assertionPath,
            assertionNode,
          );
          return;
        }
      }
      return;
    }
    const found = relevant.some(
      ({ node: owner, context, root: inRoot }) =>
        (asserted ?? []).every(([name, list]) => matches(context, name, list)) &&
        (attributes.length === 0 || attributeProblem(owner, context, inRoot) === undefined),
    );
    if (!found) {
      report(
        diagnostics,
        "expectation-failed",
        `${named}: no context of ${id}${describeWhen} has ${[
          ...pairs.map(([name, value]) => `${name}=${value}`),
          ...attributes.map(([name, list]) => `${name}=${list.join("|")}`),
        ].join(", ")}`,
        assertionPath,
        assertionNode,
      );
    }
  });
}

const assertionKeys = ["then", "some", "exists"] as const;

// A { name: value } object; with lists, a value may also be a list of values.
function values(
  diagnostics: Diagnostics,
  item: JsonNode | undefined,
  path: string,
  lists: boolean,
): [string, string[]][] | undefined {
  if (item === undefined) return [];
  const object = expectObject(diagnostics, item, path);
  if (object === undefined) return undefined;
  const result: [string, string[]][] = [];
  let valid = true;
  for (const { key, value } of object.members) {
    const valuePath = childPath(path, key.value);
    if (lists && value.kind === "array") {
      if (value.elements.length === 0) {
        report(diagnostics, "empty-values", "list at least one value", valuePath, value);
        valid = false;
        continue;
      }
      const list: string[] = [];
      value.elements.forEach((element, index) => {
        if (expectName(diagnostics, element, `${valuePath}[${index}]`)) list.push(element.value);
        else valid = false;
      });
      if (list.length > 0) result.push([key.value, list]);
      continue;
    }
    if (expectName(diagnostics, value, valuePath)) result.push([key.value, [value.value]]);
    else valid = false;
  }
  return valid ? result : undefined;
}

// A context as people read it: the node, the profile it matches (when there
// are profiles), and the other values.
function describeContext(resolver: Resolver, node: string, context: Context): string {
  const profiled = Object.keys(context).filter((name) => resolver.profiled.has(name));
  const names = profiled.length === 0 ? [] : resolver.profilesOf(context);
  const profile = names.length === 0 ? undefined : profileLabel(names);
  const rest = Object.entries(context)
    .filter(([name]) => profile === undefined || !resolver.profiled.has(name))
    .map(([name, value]) => `${name}=${value}`);
  return `${node}${profile === undefined ? "" : ` at ${profile}`}${rest.length === 0 ? "" : ` (${rest.join(", ")})`}`;
}

// exists: whether the node is present in every combination of its dimensions
// and its shared ancestors' states that matches when (true), or in none.
function checkExists(
  diagnostics: Diagnostics,
  resolver: Resolver,
  e: {
    id: string;
    root: string | undefined;
    when: [string, string[]][];
    exists: boolean;
    named: string;
    describeWhen: string;
    whenNode: JsonNode | undefined;
    path: string;
    assertionNode: JsonNode;
    assertionPath: string;
    expectation: JsonNode;
  },
): void {
  const dimensions = resolver.dimensions(e.id);
  const roots = e.root !== undefined ? [e.root] : resolver.roots(e.id);
  const lineages = (roots.length === 0 ? [undefined] : roots).map((root) => ({
    root,
    lineage: resolver.lineage(e.id, root),
  }));
  const shared = [...new Set(lineages.flatMap(({ lineage }) => resolver.sharedAncestors(lineage)))];

  // Names exists can look at: the node's dimensions, profiles and shared nodes.
  for (const [name, list] of e.when) {
    const at =
      e.whenNode?.kind === "object"
        ? e.whenNode.members.find((m) => m.key.value === name)
        : undefined;
    const fail = (code: string, message: string, item: JsonNode | undefined) => {
      report(diagnostics, code, message, childPath(`${e.path}.when`, name), item ?? e.expectation);
    };
    if (resolver.project.types.stateGroups?.[name] !== undefined || name === "state") {
      fail(
        "unknown-name",
        `"${name}" is a state group; exists looks only at dimensions, profiles and shared nodes`,
        at?.key,
      );
      return;
    }
    const allowed =
      name === "profile" && resolver.profiles.size > 0
        ? [...resolver.profiles.keys()]
        : dimensions.includes(name)
          ? (resolver.project.dimensions[name]?.values ?? [])
          : shared.includes(name)
            ? sharedStates(resolver, name)
            : undefined;
    if (allowed === undefined) {
      const names = [...dimensions, ...shared, ...(resolver.profiles.size > 0 ? ["profile"] : [])];
      fail(
        "unknown-name",
        `"${name}" is not a dimension, profile or shared node of ${e.id} (${names.join(", ")})`,
        at?.key,
      );
      return;
    }
    const unknown = list.find((each) => !allowed.includes(each));
    if (unknown !== undefined) {
      fail(
        "unknown-value",
        `"${unknown}" is not a value of ${name} (${allowed.join(", ")})`,
        at?.value,
      );
      return;
    }
  }

  const matchesWhen = (candidate: Context) =>
    e.when.every(([name, list]) =>
      list.some((value) => {
        if (name !== "profile") return candidate[name] === value;
        return resolver.inProfile(value, candidate);
      }),
    );
  for (const { root, lineage } of lineages) {
    let candidates: Context[] = [{}];
    for (const name of dimensions) {
      const options = resolver.project.dimensions[name]?.values ?? [];
      candidates = candidates.flatMap((c) => options.map((value) => ({ ...c, [name]: value })));
    }
    candidates = candidates.filter((c) => resolver.fitsProfile(c));
    for (const ancestor of resolver.sharedAncestors(lineage)) {
      candidates = candidates.flatMap((c) => {
        const resolved = resolver.resolve(ancestor, c, resolver.lineage(ancestor, root));
        return resolved.present
          ? resolved.states.map((state) => ({ ...c, [ancestor]: state }))
          : [c];
      });
    }
    const matching = candidates.filter(matchesWhen);
    if (matching.length === 0) {
      report(
        diagnostics,
        "empty-expectation",
        `${e.named}: selects no contexts of ${e.id}${e.describeWhen}`,
        e.whenNode === undefined ? e.path : `${e.path}.when`,
        e.whenNode ?? e.expectation,
      );
      return;
    }
    const wrong = matching.find(
      (candidate) => resolver.resolve(e.id, candidate, lineage).present !== e.exists,
    );
    if (wrong !== undefined) {
      // The node and the combination, by profile where it matches one.
      const described = describeContext(resolver, e.id, wrong).slice(e.id.length);
      report(
        diagnostics,
        "expectation-failed",
        `${e.named}: ${e.id} ${e.exists ? "does not exist" : "exists"}${described}`,
        e.assertionPath,
        e.assertionNode,
      );
      return;
    }
  }
}

// then or some: name -> value (or values), and attributes -> name -> value.
function assertion(
  diagnostics: Diagnostics,
  resolver: Resolver,
  item: JsonNode,
  path: string,
): { pairs: [string, string[]][]; attributes: [string, string[]][] } | undefined {
  const object = expectObject(diagnostics, item, path);
  if (object === undefined) return undefined;
  const rest = object.members.filter(({ key }) => key.value !== "attributes");
  const pairs = values(diagnostics, { ...object, members: rest }, path, true);
  const attributesMember = object.members.find(({ key }) => key.value === "attributes");
  if (attributesMember === undefined)
    return pairs === undefined ? undefined : { pairs, attributes: [] };
  const attributesPath = `${path}.attributes`;
  const attributes = values(diagnostics, attributesMember.value, attributesPath, true);
  if (pairs === undefined || attributes === undefined) return undefined;
  const declared = resolver.project.types.attributes ?? {};
  const byName = expectObject(diagnostics, attributesMember.value, attributesPath);
  for (const [name, list] of attributes) {
    const member = byName?.members.find(({ key }) => key.value === name);
    const declaration = declared[name];
    if (declaration === undefined) {
      report(
        diagnostics,
        "undeclared-attribute",
        `attribute ${JSON.stringify(name)} is not declared`,
        childPath(attributesPath, name),
        member?.key ?? attributesMember.value,
      );
      return undefined;
    }
    const unknown = list.find((value) => !declaration.values.includes(value));
    if (unknown !== undefined) {
      report(
        diagnostics,
        "unknown-value",
        `"${unknown}" is not a value of ${name} (${declaration.values.join(", ")})`,
        childPath(attributesPath, name),
        member?.value ?? attributesMember.value,
      );
      return undefined;
    }
  }
  return { pairs, attributes };
}

// A transition rule: when the shared node is in a state, on an event, then
// it is in another state and focus is on a node.
function checkTransitionRule(
  diagnostics: Diagnostics,
  resolver: Resolver,
  r: {
    id: string;
    named: string;
    path: string;
    whenNode: JsonNode | undefined;
    onNode: JsonNode;
    thenNode: JsonNode;
    expectation: JsonNode;
  },
): void {
  const states = sharedStates(resolver, r.id);
  const fail = (code: string, message: string, at: string, item: JsonNode | undefined) => {
    report(diagnostics, code, message, at, item ?? r.expectation);
  };

  // when: only the node's own state, the state before.
  const when = values(diagnostics, r.whenNode, `${r.path}.when`, false);
  if (when === undefined) return;
  let from: string | undefined;
  for (const [name, [value]] of when) {
    const at = childPath(`${r.path}.when`, name);
    if (name !== r.id) {
      fail(
        "unknown-name",
        `"${name}" is not ${r.id}'s state; a transition rule's when names only ${r.id}`,
        at,
        r.whenNode,
      );
      return;
    }
    if (!states.includes(value as string)) {
      fail(
        "unknown-value",
        `"${value}" is not a state of ${r.id} (${states.join(", ")})`,
        at,
        r.whenNode,
      );
      return;
    }
    from = value;
  }

  // on: the event and the fields that event uses; a resize names dimension values.
  const on = expectObject(diagnostics, r.onNode, `${r.path}.on`);
  if (on === undefined) return;
  const onPath = `${r.path}.on`;
  const fields = new Map(on.members.map(({ key, value }) => [key.value, { key, value }]));
  const event = fields.get("event");
  if (event === undefined) {
    fail("missing-key", 'missing required key "event"', onPath, r.onNode);
    return;
  }
  if (!expectName(diagnostics, event.value, `${onPath}.event`)) return;
  const eventName = event.value.value;
  const fieldsFor = uses[eventName];
  if (fieldsFor === undefined) {
    fail(
      "unknown-event",
      `${JSON.stringify(eventName)} is not a supported event (${Object.keys(uses).join(", ")})`,
      `${onPath}.event`,
      event.value,
    );
    return;
  }
  const given = new Map<string, string[]>();
  for (const [name, { key, value }] of fields) {
    if (name === "event") continue;
    const at = childPath(onPath, name);
    const isDimension = eventName === "resize" && resolver.project.dimensions[name] !== undefined;
    if (!isDimension && !fieldsFor.includes(name)) {
      fail(
        "unknown-key",
        `${JSON.stringify(name)} does not apply to a ${eventName} event`,
        at,
        key,
      );
      return;
    }
    const list =
      value.kind === "array"
        ? value.elements
            .filter((element) => element.kind === "string")
            .map((element) => element.value as string)
        : value.kind === "string"
          ? [value.value]
          : undefined;
    if (list === undefined || list.length === 0) {
      expectName(diagnostics, value, at);
      return;
    }
    if (
      (name === "target" || name === "outside") &&
      resolver.node(list[0] as string) === undefined
    ) {
      fail("unknown-node", `node ${JSON.stringify(list[0])} does not exist`, at, value);
      return;
    }
    given.set(name, list);
  }

  // then: the node's state after, and where focus ends up.
  const then = values(diagnostics, r.thenNode, `${r.path}.then`, false);
  if (then === undefined) return;
  let to: string | undefined;
  let focus: string | undefined;
  for (const [name, [value]] of then) {
    const at = childPath(`${r.path}.then`, name);
    if (name === r.id) {
      if (!states.includes(value as string)) {
        fail(
          "unknown-value",
          `"${value}" is not a state of ${r.id} (${states.join(", ")})`,
          at,
          r.thenNode,
        );
        return;
      }
      to = value;
    } else if (name === "focus") {
      if (resolver.node(value as string) === undefined) {
        fail("unknown-node", `node ${JSON.stringify(value)} does not exist`, at, r.thenNode);
        return;
      }
      focus = value;
    } else {
      fail(
        "unknown-name",
        `"${name}" is not something a transition sets; give ${r.id}=<state> or focus=<node>`,
        at,
        r.thenNode,
      );
      return;
    }
  }

  if (to === undefined && focus === undefined) {
    fail("missing-key", `give ${r.id}=<state>, focus=<node> or both`, `${r.path}.then`, r.thenNode);
    return;
  }

  const transitions = (resolver.node(r.id)?.transitions ?? []).filter(
    (transition) =>
      transition.on === eventName &&
      (from === undefined || transition.from === from) &&
      [...given].every(([name, list]) => {
        if (name === "key" || name === "target" || name === "outside") {
          return transition[name] === list[0];
        }
        const reached = transition.when?.[name] ?? [];
        return list.every((value) => reached.includes(value));
      }),
  );
  if (transitions.length === 0) {
    const what = [...given]
      .map(([name, list]) =>
        name === "key"
          ? list[0]
          : name === "target"
            ? `on ${list[0]}`
            : name === "outside"
              ? `outside ${list[0]}`
              : `to ${name}=${list.join("|")}`,
      )
      .join(" ");
    fail(
      "empty-expectation",
      `${r.named}: ${r.id} has no transition${from === undefined ? "" : ` from ${from}`} on ${eventName}${what === "" ? "" : ` ${what}`}`,
      onPath,
      r.onNode,
    );
    return;
  }
  for (const transition of transitions) {
    const problem =
      to !== undefined && transition.to !== to
        ? `leads to ${transition.to}, not ${to}`
        : focus !== undefined && transition.focus === undefined
          ? `does not move focus (focus=${focus})`
          : focus !== undefined && transition.focus !== focus
            ? `moves focus to ${transition.focus}, not ${focus}`
            : undefined;
    if (problem !== undefined) {
      fail(
        "expectation-failed",
        `${r.named}: transition ${transition.id} ${problem}`,
        `${r.path}.then`,
        r.thenNode,
      );
      return;
    }
  }
}
