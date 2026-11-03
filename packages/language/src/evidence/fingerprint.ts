import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Check } from "@language/evaluation/status.js";
import type { Drawn } from "@language/evidence/validate.js";

// A fingerprint of what a frame of a file shows, so evidence knows when it
// may look different. For a pen.dev file, the frame's subtree without its own
// position, every component it uses (and the components those use), and every
// variable any of them use: an edit elsewhere in the file changes nothing,
// while a change to a component or variable the frame shows does. For any
// other file, the file as a whole, by its git blob hash. Undefined when a
// pen.dev file has no such frame.
export class Fingerprints {
  private readonly documents = new Map<string, PenDocument | undefined>();

  // Whether the file is a pen.dev document.
  isPen(path: string): boolean {
    return path.endsWith(".pen") && this.document(path) !== undefined;
  }

  // Of a node of a pen.dev file, by its id; of any other file, as a whole.
  of(path: string, frame: string): string | undefined {
    if (!path.endsWith(".pen")) return blobHash(path);
    const document = this.document(path);
    if (document === undefined) return blobHash(path);
    const node = document.nodes.get(frame);
    if (node === undefined) return undefined;
    const { x: _x, y: _y, ...own } = node;
    const components = new Set<string>();
    const variables = new Set<string>();
    const visit = (value: unknown): void => {
      if (typeof value === "string" && value.startsWith("$")) {
        const name = value.slice(1);
        if (!variables.has(name) && document.variables[name] !== undefined) {
          variables.add(name);
          visit(document.variables[name]);
        }
      } else if (Array.isArray(value)) {
        for (const item of value) visit(item);
      } else if (isObject(value)) {
        if (value.type === "ref" && typeof value.ref === "string" && !components.has(value.ref)) {
          components.add(value.ref);
          visit(document.nodes.get(value.ref));
        }
        for (const item of Object.values(value)) visit(item);
      }
    };
    visit(own);
    const payload = {
      own,
      components: [...components].sort().map((id) => document.nodes.get(id) ?? null),
      variables: Object.fromEntries(
        [...variables].sort().map((name) => [name, document.variables[name]]),
      ),
    };
    return createHash("sha1")
      .update(JSON.stringify(canonical(payload)))
      .digest("hex");
  }

  // Whether a pen.dev file's frame holds a node, at any depth; a file that is
  // not one holds none.
  holds(path: string, frame: string, node: string): boolean {
    const document = this.document(path);
    const top = document?.nodes.get(frame);
    if (top === undefined) return false;
    const inside = (value: Json): boolean =>
      Array.isArray(value.children) &&
      value.children.some((child) => isObject(child) && (child.id === node || inside(child)));
    return inside(top);
  }

  // The components a node of a pen.dev file shows an instance of, by name,
  // each with how many: an instance is counted, not what its component
  // holds; for an instance itself, what its component holds, without what it
  // hides. Undefined for a file that is not one, or a node it does not have.
  instances(path: string, node: string): Map<string, number> | undefined {
    const document = this.document(path);
    const top = document?.nodes.get(node);
    if (document === undefined || top === undefined) return undefined;
    const counts = new Map<string, number>();
    const visit = (value: Json, overrides: Json): void => {
      const override = [value.id, value.name]
        .map((key) => (typeof key === "string" ? overrides[key] : undefined))
        .find(isObject);
      if (value.enabled === false || override?.enabled === false) return;
      // A descendant an instance replaces is what it shows.
      const shown = override?.type === undefined ? value : override;
      if (shown.type === "ref") {
        const name = document.nodes.get(String(shown.ref))?.name;
        if (typeof name === "string") counts.set(name, (counts.get(name) ?? 0) + 1);
        return;
      }
      if (Array.isArray(shown.children)) {
        for (const child of shown.children) if (isObject(child)) visit(child, overrides);
      }
    };
    if (top.type === "ref") {
      const component = document.nodes.get(String(top.ref));
      const hidden = isObject(top.descendants) ? top.descendants : {};
      for (const child of Array.isArray(component?.children) ? component.children : []) {
        if (isObject(child)) visit(child, hidden);
      }
    } else {
      visit(top, {});
    }
    return counts;
  }

  private document(path: string): PenDocument | undefined {
    if (!this.documents.has(path)) this.documents.set(path, readPen(path));
    return this.documents.get(path);
  }
}

type Json = Record<string, unknown>;

interface PenDocument {
  nodes: Map<string, Json>;
  variables: Json;
}

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// The document's nodes by id and its variables; undefined when the file is
// not a pen.dev document, which is then fingerprinted as a whole.
function readPen(path: string): PenDocument | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
  if (!isObject(parsed) || !Array.isArray(parsed.children)) return undefined;
  const nodes = new Map<string, Json>();
  const index = (node: unknown): void => {
    if (!isObject(node)) return;
    if (typeof node.id === "string") nodes.set(node.id, node);
    if (Array.isArray(node.children)) for (const child of node.children) index(child);
  };
  for (const child of parsed.children) index(child);
  return { nodes, variables: isObject(parsed.variables) ? parsed.variables : {} };
}

// The same value with object keys sorted, so key order does not count.
export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (isObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

// The git blob hash of a file, as "git hash-object" prints it.
function blobHash(path: string): string {
  const content = readFileSync(path);
  return createHash("sha1").update(`blob ${content.length}\0`).update(content).digest("hex");
}

// The repository a path is in: the nearest folder above it with a .git;
// otherwise the folder it is in. The caller's working directory never changes
// how a model's drawing paths resolve.
export function repositoryOf(path: string): string {
  const directory = dirname(resolve(path));
  for (let at = directory; ; at = dirname(at)) {
    if (statSync(join(at, ".git"), { throwIfNoEntry: false }) !== undefined) return at;
    if (dirname(at) === at) return directory;
  }
}

// Whether what a stored PenNode points at, in a repository, is as recorded:
// its fingerprint now, of its node or, without one, its frame, against the
// one stored. A file that is not there, or a frame that no longer holds its
// node, is gone.
export function freshness(repository: string, fingerprints = new Fingerprints()): Check {
  return ({ file, frame, node, fingerprint }) => {
    const full = join(repository, file);
    if (statSync(full, { throwIfNoEntry: false })?.isFile() !== true) return "gone";
    if (node !== undefined && fingerprints.isPen(full) && !fingerprints.holds(full, frame, node)) {
      return "gone";
    }
    const now = fingerprints.of(full, node ?? frame);
    if (now === undefined) return "gone";
    return now === fingerprint ? "recorded" : "stale";
  };
}

// What each PenNode's drawing shows, in a repository: the components its node,
// or without one its frame, has instances of; nothing known for a file that is
// not a pen.dev document.
export function drawings(repository: string, fingerprints = new Fingerprints()): Drawn {
  return ({ file, frame, node }) => {
    const full = join(repository, file);
    if (statSync(full, { throwIfNoEntry: false })?.isFile() !== true) return undefined;
    if (!fingerprints.isPen(full)) return undefined;
    return fingerprints.instances(full, node ?? frame);
  };
}
