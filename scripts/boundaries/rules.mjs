// Production-source allowlists. The parse facade is a separate layer so its
// orchestration dependency cannot spread to scanning, reading or formatting.
export const allowed = {
  "language/core": ["language/core"],
  "language/model": ["language/core", "language/model"],
  "language/data": ["language/core", "language/data"],
  "language/evaluation": ["language/core", "language/model", "language/evaluation"],
  "language/syntax": ["language/core", "language/model", "language/syntax"],
  "language/parse": ["language/core", "language/syntax", "language/analysis"],
  "language/analysis": ["language/core", "language/model", "language/evaluation"],
  "language/evidence": [
    "language/core",
    "language/model",
    "language/data",
    "language/evaluation",
    "language/evidence",
  ],
  "language/editor": [
    "language/core",
    "language/model",
    "language/evaluation",
    "language/evidence",
    "language/syntax",
    "language/parse",
    "language/editor",
  ],
  "language/api": [
    "language/core",
    "language/model",
    "language/data",
    "language/evaluation",
    "language/evidence",
    "language/syntax",
    "language/parse",
    "language/editor",
  ],
  "cli/entry": ["cli/entry", "cli/commands", "cli/support"],
  "cli/commands": ["cli/commands", "cli/support"],
  "cli/support": ["cli/support"],
  "language-server/entry": ["language-server/entry", "language-server/protocol"],
  "language-server/protocol": ["language-server/protocol"],
  vscode: ["vscode"],
  // The new implementation: the parsed form, reading it from text, checking it,
  // and refactoring it.
  "next/model": ["next/model"],
  "next/syntax": ["next/model", "next/syntax"],
  "next/check": ["next/model", "next/check"],
  "next/refactor": ["next/model", "next/syntax", "next/check", "next/refactor"],
  "next/api": ["next/model", "next/syntax", "next/check", "next/refactor"],
};

export function layerOf(path) {
  const match = /^packages\/([^/]+)\/src\/(.+)$/.exec(path);
  if (!match) return undefined;
  const [, pkg, file] = match;
  if (pkg === "language") {
    if (file === "index.ts") return "language/api";
    if (["syntax/parse.ts", "syntax/parse-tree-sitter.ts"].includes(file)) return "language/parse";
    const layer = `language/${file.split("/")[0]}`;
    return !["language/api", "language/parse"].includes(layer) && Object.hasOwn(allowed, layer)
      ? layer
      : undefined;
  }
  if (pkg === "cli") {
    if (file.startsWith("commands/support/")) return "cli/support";
    if (file.startsWith("commands/")) return "cli/commands";
    if (!file.includes("/")) return "cli/entry";
  }
  if (pkg === "language-server") {
    if (file.startsWith("protocol/")) return "language-server/protocol";
    if (!file.includes("/")) return "language-server/entry";
  }
  if (pkg === "next") {
    if (file === "index.ts") return "next/api";
    const layer = `next/${file.split("/")[0]}`;
    return layer !== "next/api" && Object.hasOwn(allowed, layer) ? layer : undefined;
  }
  return pkg === "vscode" ? "vscode" : undefined;
}
