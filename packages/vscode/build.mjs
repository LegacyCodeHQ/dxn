// Builds the extension into dist/: the extension; the language server with the
// language in one file, server.mjs; and the dxn command, dxn.mjs, which the
// code lenses run. VS Code runs both with its own Node.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build as bundle } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const server = join(here, "../language-server");
const cli = join(here, "../cli");

// A package reads its version from the package.json beside it, which the
// bundle has not: it is written in instead.
const versioned = (folder) => ({
  name: "version",
  setup(build) {
    const { version } = JSON.parse(readFileSync(join(folder, "package.json"), "utf8"));
    const file = join(folder, "src", "version.ts");
    build.onLoad({ filter: /[\\/]version\.ts$/ }, (args) =>
      args.path === file
        ? { contents: `export const version = ${JSON.stringify(version)};`, loader: "ts" }
        : undefined,
    );
  },
});

export async function build(out = join(here, "dist")) {
  const common = { bundle: true, platform: "node", target: "node20", logLevel: "warning" };
  await bundle({
    ...common,
    entryPoints: [join(here, "src/extension.ts")],
    outfile: join(out, "extension.js"),
    format: "cjs",
    external: ["vscode"],
  });
  for (const [folder, file] of [
    [server, "server.mjs"],
    [cli, "dxn.mjs"],
  ]) {
    await bundle({
      ...common,
      entryPoints: [join(folder, "src/main.ts")],
      outfile: join(out, file),
      format: "esm",
      // The language's sources, as the workspace's other packages read them.
      conditions: ["source"],
      // Their dependencies may be CommonJS, which require Node's modules.
      banner: {
        js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
      },
      plugins: [versioned(folder)],
    });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await build();
