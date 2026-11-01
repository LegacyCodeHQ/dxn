// The cell for a value a row does not have.
export const NONE = "—";

// A Markdown table as printed: its lines, ending with a newline.
export function drawTable(header: string[], body: string[][]): string {
  return `${markdown(header, body).join("\n")}\n`;
}

// A Markdown table with its columns padded to their widest cell.
function markdown(header: string[], body: string[][]): string[] {
  const widths = header.map((title, index) =>
    Math.max(title.length, ...body.map((line) => (line[index] as string).length)),
  );
  const line = (cells: string[]) =>
    `| ${cells.map((value, index) => value.padEnd(widths[index] as number)).join(" | ")} |`;
  return [line(header), line(widths.map((width) => "-".repeat(width))), ...body.map(line)];
}
