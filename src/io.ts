export interface Io {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  // The working directory commands resolve the project from; defaults to the
  // process's.
  cwd?: string;
}
