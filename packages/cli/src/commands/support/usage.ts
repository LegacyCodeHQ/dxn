// Usage is the CLI interface; language results come from the shared runtime.
export const help = `Usage: dxn <command> <file> [options]

  check <file>                       Check the new DXN language
  fmt <file> [--check | --write]      Print, check or write canonical formatting
  combinations <file> [Type]         List type combinations as tables
  rename <file> <old> <new>           Rename a declaration

Options: --json, --dry-run (rename), --help, --version
Supported syntax: enum Light { off, on }; type Lamp { varies Light }; record Shot { light: Light }
`;
