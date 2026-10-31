import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Context, Resolver } from "../resolve.js";
import type { EvidenceFile } from "../tree.js";
import { Diagnostics, type FileDiagnostic } from "./diagnostic.js";
import { Fingerprints } from "./fingerprint.js";
import { type JsonNode, parseJson } from "./json.js";
import { readSource } from "./read.js";
import {
  checkSchema,
  checkVersion,
  expectKind,
  expectName,
  expectNonEmptyString,
  expectObject,
  keys,
  report,
} from "./shape.js";
import { isTimestamp } from "./verification.js";

export interface EvidenceResult {
  diagnostics: FileDiagnostic[];
  // Root id -> its evidence file.
  files: Record<string, EvidenceFile>;
  // "<file>#<frame>" -> the frame's fingerprint now, or null when the file
  // no longer has the frame, for each frame evidence points to.
  fingerprints: Record<string, string | null>;
  // "<file>#<frame>" -> the frame's name, where the file names it.
  frameNames: Record<string, string>;
}

const entryKeys = ["node", "context", "actor", "at", "source", "fingerprint"];
const fingerprintPattern = /^[0-9a-f]{40}$/;

const sameContext = (a: Context, b: Record<string, string>) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(([name, value]) => b[name] === value);

// evidence/<root-id>.json: what actors have recorded for nodes, each entry
// for one node in one complete context, pointing to a frame in a file of the
// repository. Checked once the model compiles, against its contexts.
export function checkEvidence(
  directory: string,
  repository: string,
  resolver: Resolver,
): EvidenceResult {
  const result: EvidenceResult = { diagnostics: [], files: {}, fingerprints: {}, frameNames: {} };
  const measure = new Fingerprints();
  const folder = join(directory, "evidence");
  if (statSync(folder, { throwIfNoEntry: false })?.isDirectory() !== true) return result;
  const roots = new Set(resolver.project.roots.map((root) => root.id));
  const actors = new Set(Object.keys(resolver.project.actors?.actors ?? {}));
  const names = readdirSync(folder)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .sort();
  for (const name of names) {
    const file = `evidence/${name}.json`;
    if (!roots.has(name)) {
      result.diagnostics.push({
        file,
        code: "unknown-root",
        message: `no roots/${name}.json defines this root`,
        path: "$",
        line: 1,
        column: 1,
      });
      continue;
    }
    const read = readSource(join(directory, file));
    if (!read.ok) {
      result.diagnostics.push({
        file,
        code: read.code,
        message: read.message,
        path: "$",
        line: read.line,
        column: read.column,
      });
      continue;
    }
    const parsed = parseJson(read.source);
    const diagnostics = new Diagnostics(read.source);
    diagnostics.items.push(...parsed.diagnostics);
    if (parsed.root !== undefined) {
      const context = {
        resolver,
        root: name,
        actors,
        repository,
        fingerprints: result.fingerprints,
        frameNames: result.frameNames,
        measure,
      };
      checkFile(diagnostics, parsed.root, context);
    }
    result.diagnostics.push(...diagnostics.items.map((item) => ({ file, ...item })));
    if (diagnostics.items.length === 0) {
      result.files[name] = JSON.parse(read.source) as EvidenceFile;
    }
  }
  return result;
}

interface Scope {
  resolver: Resolver;
  root: string;
  actors: Set<string>;
  repository: string;
  fingerprints: Record<string, string | null>;
  frameNames: Record<string, string>;
  measure: Fingerprints;
}

function checkFile(diagnostics: Diagnostics, root: JsonNode, scope: Scope): void {
  const document = expectObject(diagnostics, root, "$");
  if (document === undefined) return;
  const members = keys(diagnostics, document, "$", ["$schema", "version", "evidence"], {
    required: ["version", "evidence"],
  });
  checkSchema(diagnostics, members.get("$schema"));
  checkVersion(diagnostics, members.get("version"));
  const list = members.get("evidence");
  if (list === undefined || !expectKind(diagnostics, list, "$.evidence", "array")) return;
  const seen = new Set<string>();
  list.elements.forEach((item, index) => {
    const path = `$.evidence[${index}]`;
    const key = checkEntry(diagnostics, item, path, scope);
    if (key === undefined) return;
    if (seen.has(key)) {
      report(
        diagnostics,
        "duplicate-evidence",
        "another entry has the same node, context, actor and frame",
        path,
        item,
      );
    }
    seen.add(key);
  });
}

// Returns the entry's identity when it is valid.
function checkEntry(
  diagnostics: Diagnostics,
  item: JsonNode,
  path: string,
  { resolver, root, actors, repository, fingerprints, frameNames, measure }: Scope,
): string | undefined {
  const entry = expectObject(diagnostics, item, path);
  if (entry === undefined) return undefined;
  const fields = keys(diagnostics, entry, path, entryKeys, { required: entryKeys });
  let valid = true;

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
    } else if (!resolver.roots(node.value).includes(root)) {
      report(
        diagnostics,
        "node-outside-file",
        `node ${JSON.stringify(node.value)} is not part of this file's root`,
        `${path}.node`,
        node,
      );
    } else {
      id = node.value;
    }
  }
  if (id === undefined) valid = false;

  const contextNode = fields.get("context");
  const context: Record<string, string> = {};
  const contextObject =
    contextNode === undefined
      ? undefined
      : expectObject(diagnostics, contextNode, `${path}.context`);
  if (contextObject === undefined) valid = false;
  for (const { key, value } of contextObject?.members ?? []) {
    if (expectName(diagnostics, value, `${path}.context.${key.value}`))
      context[key.value] = value.value;
    else valid = false;
  }
  if (id !== undefined && contextObject !== undefined) {
    if (!resolver.contexts(id, root).some((candidate) => sameContext(candidate, context))) {
      report(
        diagnostics,
        "unknown-context",
        `${id} has no such context in root ${JSON.stringify(root)}; "dimensions evidence ${id} --actor <name>" lists them`,
        `${path}.context`,
        contextObject,
      );
      valid = false;
    }
  }

  const actor = fields.get("actor");
  if (actor === undefined || !expectName(diagnostics, actor, `${path}.actor`)) {
    valid = false;
  } else if (!actors.has(actor.value)) {
    report(
      diagnostics,
      "undeclared-actor",
      `actor ${JSON.stringify(actor.value)} is not declared in actors.json`,
      `${path}.actor`,
      actor,
    );
    valid = false;
  } else if (resolver.project.actors?.actors[actor.value]?.evidence === undefined) {
    report(
      diagnostics,
      "actor-without-evidence",
      `actor ${JSON.stringify(actor.value)} records no evidence`,
      `${path}.actor`,
      actor,
    );
    valid = false;
  }

  const at = fields.get("at");
  if (at !== undefined && expectKind(diagnostics, at, `${path}.at`, "string")) {
    if (!isTimestamp(at.value)) {
      report(
        diagnostics,
        "invalid-timestamp",
        "must be an ISO 8601 date and time with a time zone, e.g. 2026-10-30T19:20:00Z",
        `${path}.at`,
        at,
      );
    }
  }

  const source = fields.get("source");
  const sourceObject =
    source === undefined ? undefined : expectObject(diagnostics, source, `${path}.source`);
  let where: string | undefined;
  if (sourceObject === undefined) {
    valid = false;
  } else {
    const parts = keys(diagnostics, sourceObject, `${path}.source`, ["file", "frame"], {
      required: ["file", "frame"],
    });
    const file = parts.get("file");
    const frame = parts.get("frame");
    const frameValid =
      frame !== undefined && expectNonEmptyString(diagnostics, frame, `${path}.source.frame`);
    if (file !== undefined && expectNonEmptyString(diagnostics, file, `${path}.source.file`)) {
      const full = join(repository, file.value);
      if (statSync(full, { throwIfNoEntry: false })?.isFile() !== true) {
        report(
          diagnostics,
          "missing-source",
          `${JSON.stringify(file.value)} does not exist in the repository`,
          `${path}.source.file`,
          file,
        );
      } else {
        if (frameValid && frame?.kind === "string") {
          where = `${file.value}#${frame.value}`;
          if (!(where in fingerprints)) {
            fingerprints[where] = measure.of(full, frame.value) ?? null;
            const named = measure.name(full, frame.value);
            if (named !== undefined) frameNames[where] = named;
          }
        }
      }
    }
  }
  if (where === undefined) valid = false;

  const fingerprint = fields.get("fingerprint");
  if (
    fingerprint !== undefined &&
    expectKind(diagnostics, fingerprint, `${path}.fingerprint`, "string")
  ) {
    if (!fingerprintPattern.test(fingerprint.value)) {
      report(
        diagnostics,
        "invalid-fingerprint",
        "must be a fingerprint: 40 hexadecimal characters",
        `${path}.fingerprint`,
        fingerprint,
      );
    }
  }

  if (!valid || actor?.kind !== "string") return undefined;
  const ordered = Object.fromEntries(Object.entries(context).sort(([a], [b]) => (a < b ? -1 : 1)));
  return JSON.stringify([id, ordered, actor.value, where]);
}
