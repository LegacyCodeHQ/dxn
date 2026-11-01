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
  // Whether the editor takes a link, which names the text it goes from, so
  // that it underlines a whole name, hyphens and all, rather than its words.
  let links = false;
  connection.onInitialize(({ capabilities }) => {
    links = capabilities.textDocument?.definition?.linkSupport === true;
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        definitionProvider: true,
      },
    };
  });
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
    if (found === undefined) return null;
    const target = rangeAt(text, found.to.line, found.to.column);
    if (!links) return { uri: textDocument.uri, range: target };
    const { line, column, length } = found.from;
    return [
      {
        originSelectionRange: {
          start: { line: line - 1, character: column - 1 },
          end: { line: line - 1, character: column - 1 + length },
        },
        targetUri: textDocument.uri,
        targetRange: target,
        targetSelectionRange: target,
      },
    ];
  });
  documents.listen(connection);
  connection.listen();
}
