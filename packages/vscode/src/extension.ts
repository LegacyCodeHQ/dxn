// The extension's entrypoint: starts the dxn language server for .dxn files,
// and runs what its code lenses offer. Kept free of logic, which VS Code alone
// can run; what it starts is chosen in server.ts, and what a lens runs in
// run.ts.
import { dirname, relative } from "node:path";
import {
  commands,
  type ExtensionContext,
  ProcessExecution,
  Task,
  TaskScope,
  tasks,
  Uri,
  workspace,
} from "vscode";
import { LanguageClient, type ServerOptions, TransportKind } from "vscode-languageclient/node";
import { dxn } from "./run.js";
import { serverOptions } from "./server.js";

let client: LanguageClient | undefined;

export async function activate(context: ExtensionContext): Promise<void> {
  // A code lens runs the bundled dxn command, with VS Code's own Node, as a
  // task: its output in the terminal, from the file's folder in the workspace.
  context.subscriptions.push(
    commands.registerCommand("dxn.run", async (uri: string, args: string[]) => {
      const file = Uri.parse(uri);
      const folder = workspace.getWorkspaceFolder(file);
      const cwd = folder?.uri.fsPath ?? dirname(file.fsPath);
      const execution = new ProcessExecution(
        process.execPath,
        dxn(context.extensionPath, relative(cwd, file.fsPath), args),
        { cwd, env: { ELECTRON_RUN_AS_NODE: "1" } },
      );
      const label = `dxn ${args.join(" ")}`;
      await tasks.executeTask(
        new Task({ type: "dxn", args }, folder ?? TaskScope.Workspace, label, "dxn", execution),
      );
    }),
  );
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
  // dxn files, and JSON files too, so the server reads a stored record's
  // file as the editor has it, unsaved changes and all; it says nothing of a
  // JSON file itself.
  client = new LanguageClient("dxn", "dxn language server", server, {
    documentSelector: [{ language: "dxn" }, { language: "json" }],
  });
  await client.start();
}

export async function deactivate(): Promise<void> {
  await client?.stop();
}
