// The extension's entrypoint: starts the dxn language server for .dxn files.
// Kept free of logic, which VS Code alone can run; what it starts is chosen in
// server.ts.
import { type ExtensionContext, workspace } from "vscode";
import { LanguageClient, type ServerOptions, TransportKind } from "vscode-languageclient/node";
import { serverOptions } from "./server.js";

let client: LanguageClient | undefined;

export async function activate(context: ExtensionContext): Promise<void> {
  const settings = workspace.getConfiguration("dxn.server");
  const chosen = serverOptions(
    context.extensionPath,
    settings.get<string>("path"),
    settings.get<string[]>("arguments") ?? [],
  );
  const server: ServerOptions =
    "module" in chosen
      ? { module: chosen.module, transport: TransportKind.stdio }
      : { command: chosen.command, args: chosen.args, transport: TransportKind.stdio };
  client = new LanguageClient("dxn", "dxn language server", server, {
    documentSelector: [{ language: "dxn" }],
  });
  await client.start();
}

export async function deactivate(): Promise<void> {
  await client?.stop();
}
