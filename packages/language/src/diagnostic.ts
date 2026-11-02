export interface Diagnostic {
  code: string;
  message: string;
  path: string;
  line: number;
  column: number;
  // A warning: the data is usable, but needs attention. An error otherwise.
  severity?: "warning";
  // Where in the model the problem is about, when that is one place: a line
  // and a column of the dxn file, both from one.
  element?: { line: number; column: number };
}

export class Diagnostics {
  readonly items: Diagnostic[] = [];

  constructor(private readonly source: string) {}

  // An error: the data is not usable as it is.
  error(
    code: string,
    message: string,
    path: string,
    offset: number,
    element?: { line: number; column: number },
  ): void {
    this.add(code, message, path, offset, false, element);
  }

  // A warning: the data is usable, but needs attention.
  warn(
    code: string,
    message: string,
    path: string,
    offset: number,
    element?: { line: number; column: number },
  ): void {
    this.add(code, message, path, offset, true, element);
  }

  private add(
    code: string,
    message: string,
    path: string,
    offset: number,
    warning: boolean,
    element?: { line: number; column: number },
  ): void {
    let line = 1;
    let lineStart = 0;
    for (let i = 0; i < offset && i < this.source.length; i++) {
      if (this.source[i] === "\n") {
        line++;
        lineStart = i + 1;
      }
    }
    this.items.push({
      code,
      message,
      path,
      line,
      column: offset - lineStart + 1,
      ...(warning ? { severity: "warning" as const } : {}),
      ...(element === undefined ? {} : { element }),
    });
  }
}

export function childPath(path: string, key: string): string {
  return /^[A-Za-z_$][\w$-]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}
