// Builds the extension into dist/: the extension, and the language server with
// the language in one file, server.mjs, which VS Code runs with its own Node.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build as bundle } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const server = join(here, "../language-server");

// The server reads its version from the package.json beside it, which the
// bundle has not: it is written in instead.
const version = {
  name: "version",
  setup(build) {
    const { version: written } = JSON.parse(readFileSync(join(server, "package.json"), "utf8"));
    build.onLoad({ filter: /language-server[\\/]src[\\/]version\.ts$/ }, () => ({
      contents: `export const version = ${JSON.stringify(written)};`,
      loader: "ts",
    }));
  },
};

export async function build(out = join(here, "dist")) {
  const common = { bundle: true, platform: "node", target: "node20", logLevel: "warning" };
  await bundle({
    ...common,
    entryPoints: [join(here, "src/extension.ts")],
    outfile: join(out, "extension.js"),
    format: "cjs",
    external: ["vscode"],
  });
  await bundle({
    ...common,
    entryPoints: [join(server, "src/main.ts")],
    outfile: join(out, "server.mjs"),
    format: "esm",
    // The language's sources, as the workspace's other packages read them.
    conditions: ["source"],
    // The server's dependencies are CommonJS, which require Node's modules.
    banner: {
      js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
    },
    plugins: [version],
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await build();
