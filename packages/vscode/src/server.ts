import { join } from "node:path";

// The language server to start: a command the settings name, with its
// arguments, or the one the extension bundles, which VS Code runs with its own
// Node.
export type Server = { module: string } | { command: string; args: string[] };

export function serverOptions(extension: string, path: string | undefined, args: string[]): Server {
  if (path !== undefined && path !== "") return { command: path, args };
  return { module: join(extension, "dist", "server.mjs") };
}
