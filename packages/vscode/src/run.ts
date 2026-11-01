import { join } from "node:path";

// What a code lens runs: the dxn command the extension bundles, with the
// command the lens names, the file, then the rest of its arguments.
export function dxn(extension: string, file: string, args: string[]): string[] {
  const [command, ...rest] = args;
  return [
    join(extension, "dist", "dxn.mjs"),
    ...(command === undefined ? [] : [command]),
    file,
    ...rest,
  ];
}
