import { definition } from "@legacycodehq/dxn-language";
import { type Connection, TextDocumentSyncKind, TextDocuments } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { diagnose } from "./diagnostics.js";
import { rangeAt } from "./range.js";

// Serves dxn to an editor over a connection: the problems in each open file,
// published when it opens and whenever it changes, and cleared when it closes;
// and where a name in it is declared.
export function serve(connection: Connection): void {
  const documents = new TextDocuments(TextDocument);
  connection.onInitialize(() => ({
    capabilities: { textDocumentSync: TextDocumentSyncKind.Incremental, definitionProvider: true },
  }));
  documents.onDidChangeContent(({ document }) => {
    connection.sendDiagnostics({ uri: document.uri, diagnostics: diagnose(document.getText()) });
  });
  documents.onDidClose(({ document }) => {
    connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
  });
  connection.onDefinition(({ textDocument, position }) => {
    const document = documents.get(textDocument.uri);
    if (document === undefined) return null;
    const text = document.getText();
    const found = definition(text, position.line + 1, position.character + 1);
    return found === undefined
      ? null
      : { uri: textDocument.uri, range: rangeAt(text, found.line, found.column) };
  });
  documents.listen(connection);
  connection.listen();
}
