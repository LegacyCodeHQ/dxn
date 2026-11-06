import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "../build.mjs";

// The extension as it is built: the extension, and the language server with
// the language in one file, which VS Code runs with its own Node, so nothing
// else need be installed.

const out = mkdtempSync(join(tmpdir(), "dxn-vscode-"));
beforeAll(async () => {
  await build(out);
}, 60_000);
afterAll(() => rmSync(out, { recursive: true, force: true }));

// The first problems the bundled server publishes for a file it is sent.
function problems(text: string): Promise<{ code: string; message: string }[]> {
  return new Promise((resolve, reject) => {
    const server = spawn(process.execPath, [join(out, "server.mjs"), "--stdio"]);
    const send = (message: object) => {
      const body = JSON.stringify({ jsonrpc: "2.0", ...message });
      server.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    };
    let received = "";
    server.stdout.on("data", (chunk: Buffer) => {
      received += chunk.toString();
      const published = received.match(
        /\{"jsonrpc":"2\.0","method":"textDocument\/publishDiagnostics".*?\]\}\}/,
      );
      if (published === null) return;
      server.kill();
      resolve(JSON.parse(published[0]).params.diagnostics);
    });
    server.on("error", reject);
    send({
      id: 1,
      method: "initialize",
      params: { processId: null, rootUri: null, capabilities: {} },
    });
    send({ method: "initialized", params: {} });
    send({
      method: "textDocument/didOpen",
      params: { textDocument: { uri: "file:///a.dxn", languageId: "dxn", version: 1, text } },
    });
  });
}

describe("the built extension", () => {
  it("has the extension, and the server and the dxn command it bundles", () => {
    expect(
      ["extension.js", "server.mjs", "dxn.mjs"].map((file) => existsSync(join(out, file))),
    ).toEqual([true, true, true]);
  });

  it("runs the bundled dxn command, as a code lens does", () => {
    const file = join(out, "model.dxn");
    writeFileSync(file, "enum Light { off, on }\n");
    const run = spawnSync(process.execPath, [join(out, "dxn.mjs"), "check", file, "--json"], {
      encoding: "utf8",
    });
    expect({ status: run.status, problems: JSON.parse(run.stdout).problems }).toEqual({
      status: 0,
      problems: [],
    });
  });

  it("runs the bundled server, which checks a file as the language does", async () => {
    expect(await problems("enum Light { off, on }\n")).toEqual([]);
    expect((await problems("enum Light = off | on\n")).map((p) => p.code)).toEqual([
      "syntax-error",
    ]);
  });
});
