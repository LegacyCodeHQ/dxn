export interface Io {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  // The working directory commands resolve files against; defaults to the
  // process's.
  cwd?: string;
  // The folder dxn keeps what it makes for the user alone, such as review
  // pages, outside every repository; defaults to the user's cache folder.
  cache?: string;
}
