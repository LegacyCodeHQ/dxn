export interface Diagnostic {
  code: string;
  message: string;
  path: string;
  line: number;
  column: number;
}

export interface FileDiagnostic extends Diagnostic {
  // Relative to the project directory, e.g. "roots/article-page.json".
  file: string;
}

export class Diagnostics {
  readonly items: Diagnostic[] = [];

  constructor(private readonly source: string) {}

  report(code: string, message: string, path: string, offset: number): void {
    let line = 1;
    let lineStart = 0;
    for (let i = 0; i < offset && i < this.source.length; i++) {
      if (this.source[i] === "\n") {
        line++;
        lineStart = i + 1;
      }
    }
    this.items.push({ code, message, path, line, column: offset - lineStart + 1 });
  }
}

export function childPath(path: string, key: string): string {
  return /^[A-Za-z_$][\w$-]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}
