import type { Diagnostic, Documentation, DocumentationTag } from "@language/core/ast.js";
import type { Token } from "@language/syntax/scan.js";

interface DocumentationBlock {
  documentation?: Documentation;
  diagnostics: Diagnostic[];
}

// Index contiguous comment lines at declaration boundaries. Ordinary comments
// elsewhere remain trivia; unknown/duplicate tags are retained for analysis.
export function documentationBlocks(tokens: readonly Token[]): Map<Token, DocumentationBlock> {
  const blocks = new Map<Token, DocumentationBlock>();
  for (let index = 0; index < tokens.length; index++) {
    const first = tokens[index];
    if (first?.kind !== "comment") continue;
    const before = tokens[index - 1];
    // Inline comments end the preceding entry, except at an opening body.
    if (before?.line === first.line && before.kind !== "{") continue;
    const lines: Token[] = [];
    let at = index;
    while (tokens[at]?.kind === "comment") {
      lines.push(tokens[at] as Token);
      at += 1;
      if (tokens[at]?.kind !== "newline") break;
      at += 1;
    }
    index = at - 1;
    const declaration = tokens[at];
    if (
      declaration?.kind !== "word" ||
      !["enum", "type", "state"].includes(declaration.text) ||
      !lines.some(({ text }) => text.startsWith("##"))
    )
      continue;
    const mixed = lines.find(({ text }) => !text.startsWith("##"));
    blocks.set(
      declaration,
      mixed
        ? {
            diagnostics: [
              {
                severity: "error",
                code: "syntax-error",
                message: "ordinary comments and documentation cannot be mixed in an attached block",
                line: mixed.line,
                column: mixed.column,
              },
            ],
          }
        : readBlock(lines),
    );
  }
  return blocks;
}

function readBlock(lines: readonly Token[]): DocumentationBlock {
  const diagnostics: Diagnostic[] = [];
  const description: string[] = [];
  const tags: DocumentationTag[] = [];
  let active: DocumentationTag | undefined;
  for (const line of lines) {
    const text = line.text.slice(2);
    // An empty ## line carries no text and does not end tag continuation.
    if (text === "") continue;
    const tag = /^([ \t]*)@([A-Za-z][A-Za-z0-9-]*)(?:([ \t]+)([^ \t]+)(?:[ \t]+(.*))?)?$/.exec(
      text,
    );
    if (tag) {
      const [, indent = "", name = "", gap = "", target, prose = ""] = tag;
      const column = line.column + 2 + indent.length + 1;
      active = {
        name,
        line: line.line,
        column,
        length: name.length,
        ...(target
          ? {
              target: {
                name: target,
                line: line.line,
                column: column + name.length + gap.length,
                length: [...target].length,
              },
            }
          : {}),
        description: prose.trim(),
      };
      tags.push(active);
    } else if (/^[ \t]*@/.test(text)) {
      diagnostics.push({
        severity: "error",
        code: "syntax-error",
        message: "invalid documentation tag syntax",
        line: line.line,
        column: line.column + 2 + text.indexOf("@"),
      });
      active = undefined;
    } else if (active && /^(?: {2}|[ \t]*\t)/.test(text)) {
      active.description = [active.description, text.trim()].filter(Boolean).join("\n");
    } else {
      active = undefined;
      description.push(text.trim());
    }
  }
  return { documentation: { description: description.join("\n"), tags }, diagnostics };
}
