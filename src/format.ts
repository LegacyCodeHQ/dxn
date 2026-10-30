// Formats JSON the way Prettier formats the files the CLI writes: objects
// always expanded, and arrays of plain values on one line when that line
// (indentation, key and trailing comma included) fits in 80 columns.
const printWidth = 80;

export function formatJson(value: unknown): string {
  return `${format(value, "", "", "")}\n`;
}

// prefix: what precedes the value on its line (key, colon); suffix: what
// follows it (a comma).
function format(value: unknown, indent: string, prefix: string, suffix: string): string {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    if (value.every(isPlain)) {
      const inline = `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
      if (indent.length + prefix.length + inline.length + suffix.length <= printWidth) {
        return inline;
      }
    }
    const inner = `${indent}  `;
    const items = value.map(
      (item, index) =>
        `${inner}${format(item, inner, "", index < value.length - 1 ? "," : "")}${index < value.length - 1 ? "," : ""}`,
    );
    return `[\n${items.join("\n")}\n${indent}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return "{}";
    }
    const inner = `${indent}  `;
    const lines = entries.map(([key, item], index) => {
      const comma = index < entries.length - 1 ? "," : "";
      const keyText = `${JSON.stringify(key)}: `;
      return `${inner}${keyText}${format(item, inner, keyText, comma)}${comma}`;
    });
    return `{\n${lines.join("\n")}\n${indent}}`;
  }
  return JSON.stringify(value);
}

function isPlain(value: unknown): boolean {
  return value === null || typeof value !== "object";
}
