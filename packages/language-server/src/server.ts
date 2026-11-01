import {
  type CompletionKind,
  completions,
  definition,
  hover,
  usages,
} from "@legacycodehq/dxn-language";
import {
  CompletionItemKind,
  type Connection,
  TextDocumentSyncKind,
  TextDocuments,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { diagnose } from "./diagnostics.js";
import { rangeAt } from "./range.js";

// Serves dxn to an editor over a connection: the problems in each open file,
// published when it opens and whenever it changes, and cleared when it closes;
// where a name in it is declared, and where it is used; what it is; and what
// fits where the cursor is.
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
        referencesProvider: true,
        hoverProvider: true,
        // Typing a name asks on its own; a dot starts the next part of a path.
        completionProvider: { triggerCharacters: ["."] },
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
  connection.onReferences(({ textDocument, position, context }) => {
    const document = documents.get(textDocument.uri);
    if (document === undefined) return null;
    const found = usages(document.getText(), position.line + 1, position.character + 1);
    if (found === undefined) return null;
    const spans = context.includeDeclaration ? [found.declaration, ...found.usages] : found.usages;
    return spans.map(({ line, column, length }) => ({
      uri: textDocument.uri,
      range: {
        start: { line: line - 1, character: column - 1 },
        end: { line: line - 1, character: column - 1 + length },
      },
    }));
  });
  connection.onHover(({ textDocument, position }) => {
    const document = documents.get(textDocument.uri);
    if (document === undefined) return null;
    const found = hover(document.getText(), position.line + 1, position.character + 1);
    if (found === undefined) return null;
    const { line, column, length } = found.from;
    const comment = found.comment === undefined ? "" : `\n\n${found.comment}`;
    return {
      contents: { kind: "markdown", value: `\`\`\`dxn\n${found.code}\n\`\`\`${comment}` },
      range: {
        start: { line: line - 1, character: column - 1 },
        end: { line: line - 1, character: column - 1 + length },
      },
    };
  });
  connection.onCompletion(({ textDocument, position }) => {
    const document = documents.get(textDocument.uri);
    if (document === undefined) return null;
    return completions(document.getText(), position.line + 1, position.character + 1).map(
      ({ label, kind }) => ({ label, kind: kinds[kind], detail: kind }),
    );
  });
  documents.listen(connection);
  connection.listen();
}

// How an editor shows each kind of suggestion.
const kinds: Record<CompletionKind, CompletionItemKind> = {
  keyword: CompletionItemKind.Keyword,
  enum: CompletionItemKind.Enum,
  dimension: CompletionItemKind.Unit,
  type: CompletionItemKind.Class,
  record: CompletionItemKind.Struct,
  scalar: CompletionItemKind.TypeParameter,
  environment: CompletionItemKind.Module,
  profile: CompletionItemKind.Constant,
  value: CompletionItemKind.EnumMember,
  state: CompletionItemKind.Field,
  event: CompletionItemKind.Event,
  action: CompletionItemKind.Method,
  child: CompletionItemKind.Property,
};
