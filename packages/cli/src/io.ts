export interface Io {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  // The working directory commands resolve files against; defaults to the
  // process's.
  cwd?: string;
}
