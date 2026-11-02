// Fail when the dxn command or the language server words the model itself:
// a term of the model's vocabulary written in a string in their sources,
// which packages/language says for both. Each one that is not the model's
// wording, such as a word in a usage line, is listed in allowed.txt.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "../..");
const here = import.meta.dirname;
const read = (name) =>
  readFileSync(join(here, name), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
const terms = read("terms.txt");
const allowed = new Set(read("allowed.txt"));
const pattern = new RegExp(`\\b(${terms.join("|")})\\b`, "i");

// Every .ts file under a folder.
const files = (folder) =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return files(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });

// The strings of a source, with the line each starts on: quoted and template
// literals, outside comments, each of a template's expressions as "…".
function strings(source) {
  const found = [];
  let line = 1;
  for (let at = 0; at < source.length; at++) {
    const char = source[at];
    if (char === "\n") line++;
    else if (char === "/" && source[at + 1] === "/") {
      while (at < source.length && source[at] !== "\n") at++;
      line++;
    } else if (char === "/" && source[at + 1] === "*") {
      const end = source.indexOf("*/", at + 2);
      line += source.slice(at, end).split("\n").length - 1;
      at = end + 1;
    } else if (char === '"' || char === "'" || char === "`") {
      const start = line;
      let text = "";
      for (at++; at < source.length && source[at] !== char; at++) {
        if (char === "`" && source[at] === "$" && source[at + 1] === "{") {
          let depth = 0;
          for (; at < source.length; at++) {
            if (source[at] === "{") depth++;
            if (source[at] === "}" && --depth === 0) break;
            if (source[at] === "\n") line++;
          }
          text += "…";
          continue;
        }
        if (source[at] === "\\") {
          text += source[at] + source[at + 1];
          at++;
          continue;
        }
        if (source[at] === "\n") line++;
        text += source[at];
      }
      found.push({ line: start, text });
    }
  }
  return found;
}

const problems = [];
for (const folder of ["packages/cli/src", "packages/language-server/src"]) {
  for (const path of files(join(root, folder))) {
    const shown = relative(root, path);
    if (allowed.has(shown)) continue;
    for (const { line, text } of strings(readFileSync(path, "utf8"))) {
      // A name on its own, a key or a flag, is not wording.
      if (/^-{0,2}[A-Za-z][\w.-]*$/.test(text)) continue;
      if (!pattern.test(text) || allowed.has(`${shown}: ${text}`)) continue;
      problems.push(`${shown}:${line}: ${text}`);
    }
  }
}
if (problems.length > 0) {
  console.error(
    "vocabulary: the model's words are written outside packages/language; say them there, or allow each in scripts/vocabulary/allowed.txt:",
  );
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log("vocabulary: the model's words are said only in packages/language");
