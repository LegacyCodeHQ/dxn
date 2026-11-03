import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { evidence } from "@language-server/protocol/evidence.js";
import { parse } from "@legacycodehq/dxn-language";
import { afterAll, describe, expect, it } from "vitest";
import type { Diagnostic } from "vscode-languageserver/node";

// The problems an editor shows for the stored records beside a file, which are
// those dxn finds.

const folders: string[] = [];
afterAll(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
});

// The problems shown for a file and its stored records, each as
// "<file>:<line>:<column>: <code>: <message>", by the file's name.
function shown(source: string, stored: Record<string, string>): string[] {
  const folder = mkdtempSync(join(tmpdir(), "dxn-evidence-"));
  folders.push(folder);
  writeFileSync(join(folder, "spec.dxn"), source);
  for (const [path, content] of Object.entries(stored)) {
    mkdirSync(join(folder, path, ".."), { recursive: true });
    writeFileSync(join(folder, path), content);
  }
  const uri = pathToFileURL(join(folder, "spec.dxn")).href;
  const found = evidence(uri, parse(source), source) ?? new Map<string, Diagnostic[]>();
  return [...found.entries()].flatMap(([at, problems]) =>
    problems.map(
      ({ range, code, message }) =>
        `${at.slice(at.indexOf(folder) + folder.length + 1)}:${range.start.line + 1}:${range.start.character + 1}: ${code}: ${message}`,
    ),
  );
}

describe("the stored records an editor checks", () => {
  it("are refused for a record no actor records, at its declaration, and its files are not checked", () => {
    const source = "enum Hover = rest\ntype Link {\n  state hover: Hover\n}\nrecord Draft {\n}\n";
    const bogus = `[\n  { "context": { "type": "Link", "dimensions": {}, "states": { "hover": "bogus" } } }\n]\n`;
    expect(shown(source, { "draft/a.json": bogus })).toMatchInlineSnapshot(`
      [
        "spec.dxn:5:8: unrecorded-record: \`Draft\` is stored in draft/, but no actor records it; declare \`actor <name> records Draft\`",
      ]
    `);
  });
});
