import { readFileSync } from "node:fs";

export type ReadResult =
  | { ok: true; source: string }
  | {
      ok: false;
      code: "missing-file" | "not-a-file" | "unreadable-file" | "invalid-encoding";
      message: string;
      line: number;
      column: number;
    };

// Reads a file as strict UTF-8, turning filesystem and encoding errors into
// diagnostic codes. A byte order mark is kept so the parser can report it.
export function readSource(path: string): ReadResult {
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return failure("missing-file", "file not found");
    }
    if (code === "EISDIR") {
      return failure("not-a-file", "not a file");
    }
    return failure("unreadable-file", `cannot read file (${code ?? "unknown error"})`);
  }
  const bad = invalidUtf8Offset(bytes);
  if (bad !== undefined) {
    const before = bytes.subarray(0, bad).toString("utf8");
    const lineStart = before.lastIndexOf("\n") + 1;
    return failure(
      "invalid-encoding",
      `invalid UTF-8 byte 0x${(bytes[bad] as number).toString(16).padStart(2, "0")}`,
      before.split("\n").length,
      before.length - lineStart + 1,
    );
  }
  return { ok: true, source: bytes.toString("utf8") };
}

function failure(
  code: Extract<ReadResult, { ok: false }>["code"],
  message: string,
  line = 1,
  column = 1,
): ReadResult {
  return { ok: false, code, message, line, column };
}

// Offset of the first byte that does not start a valid UTF-8 sequence:
// rejects stray continuation bytes, truncated and overlong sequences,
// encoded surrogates and code points above U+10FFFF.
function invalidUtf8Offset(bytes: Uint8Array): number | undefined {
  let i = 0;
  while (i < bytes.length) {
    const lead = bytes[i] as number;
    if (lead < 0x80) {
      i++;
      continue;
    }
    let length: number;
    let minimum: number;
    if (lead >= 0xc2 && lead <= 0xdf) {
      length = 1;
      minimum = 0x80;
    } else if (lead >= 0xe0 && lead <= 0xef) {
      length = 2;
      minimum = 0x800;
    } else if (lead >= 0xf0 && lead <= 0xf4) {
      length = 3;
      minimum = 0x10000;
    } else {
      return i;
    }
    let codePoint = lead & (0x3f >> length);
    for (let k = 1; k <= length; k++) {
      const next = bytes[i + k];
      if (next === undefined || (next & 0xc0) !== 0x80) {
        return i;
      }
      codePoint = (codePoint << 6) | (next & 0x3f);
    }
    if (
      codePoint < minimum ||
      codePoint > 0x10ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      return i;
    }
    i += length + 1;
  }
  return undefined;
}
