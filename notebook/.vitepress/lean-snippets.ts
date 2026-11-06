import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { MarkdownRenderer } from "vitepress";

// Include a region of a Lean file in a page, as VitePress's `<<<` includes
// regions of other languages, which does not know Lean's `--` comments:
//
//   <<< lean:lean/Dxn/FiniteSet.lean#finite
//
// includes the lines between `-- #region finite` and `-- #endregion finite`,
// with the path taken from the repository root. A missing file or region fails
// the build, so a page never shows code that is no longer there.

const include = /^<<< lean:(\S+?)#([\w-]+)$/;
const marker = /^\s*-- #(?:end)?region [\w-]+\s*$/;

/** The lines of a region, without any region markers, and with their shared indent removed. */
export function region(text: string, name: string, path: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim() === `-- #region ${name}`);
  const end = lines.findIndex(
    (line, index) => index > start && line.trim() === `-- #endregion ${name}`,
  );
  if (start < 0 || end < 0) throw new Error(`${path} has no region ${name}`);
  const body = lines.slice(start + 1, end).filter((line) => !marker.test(line));
  const indent = Math.min(
    ...body
      .filter((line) => line.trim() !== "")
      .map((line) => line.length - line.trimStart().length),
  );
  return body.map((line) => line.slice(Number.isFinite(indent) ? indent : 0)).join("\n");
}

/** Add `<<< lean:path#region` to the renderer, with paths from `root`. */
export function leanSnippets(md: MarkdownRenderer, root: string): void {
  md.block.ruler.before("snippet", "lean_snippet", (state, startLine, _endLine, silent) => {
    const from = state.bMarks[startLine] + state.tShift[startLine];
    const match = include.exec(state.src.slice(from, state.eMarks[startLine]));
    if (!match) return false;
    if (silent) return true;
    const [, path = "", name = ""] = match;
    const token = state.push("fence", "code", 0);
    token.info = "lean";
    token.content = `${region(readFileSync(resolve(root, path), "utf8"), name, path)}\n`;
    token.map = [startLine, startLine + 1];
    state.line = startLine + 1;
    return true;
  });
}
