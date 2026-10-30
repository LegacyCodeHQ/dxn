import { childPath } from "./diagnostic.js";
import type { JsonNode, StringNode } from "./json.js";
import { isAbsent } from "./overrides.js";
import { expectKind, expectName, expectObject, keys, report, stringElements } from "./shape.js";
import type { DimensionSymbol, TransitionRef, TreeSymbols } from "./symbols.js";

// DOM events a transition can happen on, and the field each one needs.
const events: Record<string, string> = {
  click: "target",
  keydown: "key",
  pointerdown: "target",
  resize: "when",
};

const fields = ["id", "from", "to", "on", "key", "target", "outside", "when", "focus"];

// Checks every node's transitions: how its shared state changes. Runs once
// dimensions and their "only" restrictions are known, so it can tell whether
// a target exists in the state the transition starts from and whether the
// focus target exists where it ends.
export function checkTransitions(
  tree: TreeSymbols,
  dimensions: Map<string, { symbol: DimensionSymbol }>,
): void {
  for (const ref of tree.transitionRefs) {
    checkNodeTransitions(tree, dimensions, ref);
  }
}

function checkNodeTransitions(
  tree: TreeSymbols,
  dimensions: Map<string, { symbol: DimensionSymbol }>,
  ref: TransitionRef,
): void {
  const { diagnostics } = ref;
  if (!expectKind(diagnostics, ref.item, ref.path, "array")) return;
  const type = tree.nodeTypes.get(ref.node);
  if (type === undefined || !tree.sharedTypes.has(type)) {
    report(
      diagnostics,
      "transitions-without-shared-state",
      `node ${JSON.stringify(ref.node)} needs a shared type for transitions to change its state`,
      ref.path,
      ref.item,
    );
    return;
  }
  const states = tree.types.get(type) ?? new Set<string>();
  const ids = new Set<string>();
  const seen = new Set<string>();

  ref.item.elements.forEach((element, index) => {
    const path = `${ref.path}[${index}]`;
    const transition = expectObject(diagnostics, element, path);
    if (transition === undefined) return;
    const members = keys(diagnostics, transition, path, fields, {
      required: ["id", "from", "to", "on"],
    });
    const name = (key: string): StringNode | undefined => {
      const item = members.get(key);
      return item !== undefined && expectName(diagnostics, item, `${path}.${key}`)
        ? item
        : undefined;
    };
    let valid = true;

    const id = name("id");
    if (id !== undefined) {
      if (ids.has(id.value)) {
        report(
          diagnostics,
          "duplicate-id",
          `transition id ${JSON.stringify(id.value)} is already used`,
          `${path}.id`,
          id,
        );
        valid = false;
      }
      ids.add(id.value);
    }

    const state = (key: "from" | "to") => {
      const item = name(key);
      if (item !== undefined && !states.has(item.value)) {
        report(
          diagnostics,
          "unknown-state",
          `${JSON.stringify(item.value)} is not a state of ${JSON.stringify(ref.node)}`,
          `${path}.${key}`,
          item,
        );
        return undefined;
      }
      return item;
    };
    const from = state("from");
    const to = state("to");

    const on = name("on");
    const needs = on === undefined ? undefined : events[on.value];
    if (on !== undefined && needs === undefined) {
      report(
        diagnostics,
        "unknown-event",
        `${JSON.stringify(on.value)} is not a supported event (${Object.keys(events).join(", ")})`,
        `${path}.on`,
        on,
      );
      valid = false;
    }
    if (
      needs !== undefined &&
      !members.has(needs) &&
      !(on?.value === "pointerdown" && members.has("outside"))
    ) {
      report(
        diagnostics,
        "missing-key",
        on?.value === "pointerdown"
          ? `a pointerdown transition needs a "target" or "outside"`
          : `a ${on?.value} transition needs ${JSON.stringify(needs)}`,
        childPath(path, needs),
        transition,
      );
      valid = false;
    }

    const key = name("key");
    const node = (field: "target" | "outside" | "focus") => {
      const item = name(field);
      if (item !== undefined && !tree.ids.has(item.value)) {
        report(
          diagnostics,
          "unknown-node",
          `node ${JSON.stringify(item.value)} does not exist`,
          `${path}.${field}`,
          item,
        );
        return undefined;
      }
      return item;
    };
    const target = node("target");
    const outside = node("outside");
    const focus = node("focus");

    // when: dimension -> the values it changes to.
    const when = new Map<string, string[]>();
    const whenNode = members.get("when");
    const whenObject =
      whenNode === undefined ? undefined : expectObject(diagnostics, whenNode, `${path}.when`);
    for (const { key: dimension, value } of whenObject?.members ?? []) {
      const dimensionPath = childPath(`${path}.when`, dimension.value);
      const declared = dimensions.get(dimension.value)?.symbol;
      if (declared === undefined) {
        report(
          diagnostics,
          "undeclared-dimension",
          `dimension ${JSON.stringify(dimension.value)} is not declared`,
          dimensionPath,
          dimension,
        );
        valid = false;
        continue;
      }
      if (!expectKind(diagnostics, value, dimensionPath, "array")) continue;
      const listed: string[] = [];
      for (const [element, elementPath] of stringElements(
        diagnostics,
        value,
        dimensionPath,
        "duplicate-value",
      )) {
        if (declared.values !== undefined && !declared.values.has(element.value)) {
          report(
            diagnostics,
            "unknown-dimension-value",
            `${JSON.stringify(element.value)} is not a value of ${JSON.stringify(dimension.value)}`,
            elementPath,
            element,
          );
          valid = false;
          continue;
        }
        listed.push(element.value);
      }
      when.set(dimension.value, listed);
    }

    // The target must exist in the state the transition starts from, and the
    // focus target where it ends, including at the dimension values it changes to.
    if (
      target !== undefined &&
      from !== undefined &&
      !existsInState(tree, target.value, ref.node, from.value)
    ) {
      report(
        diagnostics,
        "target-absent",
        `${JSON.stringify(target.value)} does not exist while ${JSON.stringify(ref.node)} is ${from.value}`,
        `${path}.target`,
        target,
      );
      valid = false;
    }
    if (focus !== undefined && to !== undefined) {
      const missing = !existsInState(tree, focus.value, ref.node, to.value)
        ? `while ${JSON.stringify(ref.node)} is ${to.value}`
        : [...when].flatMap(([dimension, values]) =>
            values
              .filter((value) =>
                isAbsent(tree, dimensions.get(dimension)?.symbol.only, focus.value, value),
              )
              .map((value) => `at ${dimension}=${value}`),
          )[0];
      if (missing !== undefined) {
        report(
          diagnostics,
          "focus-absent",
          `${JSON.stringify(focus.value)} does not exist ${missing}, so it cannot take focus`,
          `${path}.focus`,
          focus,
        );
        valid = false;
      }
    }

    if (!valid || from === undefined || to === undefined || on === undefined) return;
    const identity = JSON.stringify([
      from.value,
      on.value,
      key?.value,
      target?.value,
      outside?.value,
      [...when].sort(([a], [b]) => (a < b ? -1 : 1)),
    ]);
    if (seen.has(identity)) {
      report(
        diagnostics,
        "duplicate-transition",
        "another transition has the same state, event and target",
        path,
        transition,
      );
      return;
    }
    seen.add(identity);
    if (id !== undefined) {
      const known = tree.transitions.get(ref.node) ?? new Set<string>();
      known.add(id.value);
      tree.transitions.set(ref.node, known);
    }
  });
}

// Whether a node exists while a shared ancestor is in a state: neither it nor
// an ancestor in its file has an onlyWhen leaving that state out.
function existsInState(tree: TreeSymbols, id: string, shared: string, state: string): boolean {
  for (
    let current: string | undefined = id;
    current !== undefined;
    current = tree.parents.get(current)
  ) {
    const allowed = tree.onlyWhen.get(current)?.get(shared);
    if (allowed !== undefined && !allowed.has(state)) return false;
  }
  return true;
}

export type { JsonNode };
