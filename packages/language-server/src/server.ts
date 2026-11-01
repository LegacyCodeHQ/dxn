import { type Connection, TextDocumentSyncKind, TextDocuments } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { diagnose } from "./diagnostics.js";

// Serves dxn to an editor over a connection: the problems in each open file,
// published when it opens and whenever it changes, and cleared when it closes.
export function serve(connection: Connection): void {
  const documents = new TextDocuments(TextDocument);
  connection.onInitialize(() => ({
    capabilities: { textDocumentSync: TextDocumentSyncKind.Incremental },
  }));
  documents.onDidChangeContent(({ document }) => {
    connection.sendDiagnostics({ uri: document.uri, diagnostics: diagnose(document.getText()) });
  });
  documents.onDidClose(({ document }) => {
    connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
  });
  documents.listen(connection);
  connection.listen();
}
