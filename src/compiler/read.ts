import { readFileSync } from "node:fs";

export type ReadResult =
  | { ok: true; source: string }
  | { ok: false; code: "missing-file" | "not-a-file" | "unreadable-file"; message: string };

// Reads a file as UTF-8, turning filesystem errors into diagnostic codes.
export function readSource(path: string): ReadResult {
  try {
    return { ok: true, source: readFileSync(path, "utf8") };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return { ok: false, code: "missing-file", message: "file not found" };
    }
    if (code === "EISDIR") {
      return { ok: false, code: "not-a-file", message: "not a file" };
    }
    return {
      ok: false,
      code: "unreadable-file",
      message: `cannot read file (${code ?? "unknown error"})`,
    };
  }
}
