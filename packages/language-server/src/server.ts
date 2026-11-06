import {
  analyze,
  format,
  renameAt,
  type Span,
  semanticTokens,
  symbolAt,
} from "@legacycodehq/dxn-next";
import {
  type Connection,
  ErrorCodes,
  type Range,
  ResponseError,
  SemanticTokensBuilder,
  SymbolKind,
  TextDocumentSyncKind,
  TextDocuments,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

/** The new language over LSP. All requests use the current unsaved buffer. */
export function serve(connection: Connection): void {
  const documents = new TextDocuments(TextDocument);
  const document = (uri: string) => {
    const d = documents.get(uri);
    return d?.languageId === "dxn" ? d : undefined;
  };
  const range = (d: TextDocument, span: Span): Range => ({
    start: d.positionAt(span.start),
    end: d.positionAt(span.end),
  });
  const publish = (d: TextDocument) => {
    if (d.languageId !== "dxn") return;
    const { problems } = analyze(d.getText());
    connection.sendDiagnostics({
      uri: d.uri,
      version: d.version,
      diagnostics: problems.flatMap((p) =>
        p.at.map((at) => ({
          range: range(d, at),
          severity: 1,
          code: p.code,
          ...(p.rule
            ? { data: { rule: p.rule, ...(p.suggestion ? { suggestion: p.suggestion } : {}) } }
            : {}),
          message: p.message,
          source: "dxn",
        })),
      ),
    });
  };
  connection.onInitialize(() => ({
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      documentSymbolProvider: true,
      documentFormattingProvider: true,
      renameProvider: { prepareProvider: true },
      codeLensProvider: { resolveProvider: false },
      semanticTokensProvider: {
        legend: { tokenTypes: ["enum", "enumMember"], tokenModifiers: ["declaration"] },
        full: true,
      },
    },
  }));
  documents.onDidChangeContent(({ document: d }) => publish(d));
  documents.onDidClose(({ document: d }) =>
    connection.sendDiagnostics({ uri: d.uri, diagnostics: [] }),
  );
  connection.onHover(({ textDocument, position }) => {
    const d = document(textDocument.uri);
    if (!d) return null;
    const symbol = symbolAt(d.getText(), d.offsetAt(position));
    return symbol
      ? { range: range(d, symbol.span), contents: { kind: "plaintext", value: symbol.signature } }
      : null;
  });
  connection.onDefinition(({ textDocument, position }) => {
    const d = document(textDocument.uri);
    if (!d) return null;
    const symbol = symbolAt(d.getText(), d.offsetAt(position));
    return symbol ? { uri: d.uri, range: range(d, symbol.span) } : null;
  });
  connection.onReferences(({ textDocument, position, context }) => {
    const d = document(textDocument.uri);
    if (!d || !context.includeDeclaration) return [];
    const symbol = symbolAt(d.getText(), d.offsetAt(position));
    // Enums currently have no reference syntax; each member is a declaration too.
    return symbol ? [{ uri: d.uri, range: range(d, symbol.span) }] : [];
  });
  connection.onPrepareRename(({ textDocument, position }) => {
    const d = document(textDocument.uri);
    if (!d) return null;
    const symbol = symbolAt(d.getText(), d.offsetAt(position));
    return symbol?.kind === "enum"
      ? { range: range(d, symbol.span), placeholder: symbol.name }
      : null;
  });
  connection.onRenameRequest(({ textDocument, position, newName }) => {
    const d = document(textDocument.uri);
    if (!d) return null;
    const renamed = renameAt(d.getText(), d.offsetAt(position), newName);
    if (!renamed)
      throw new ResponseError(ErrorCodes.InvalidParams, "only enumeration names can be renamed");
    if (!renamed.file)
      throw new ResponseError(ErrorCodes.InvalidParams, JSON.stringify(renamed.refusals));
    return {
      documentChanges: [
        {
          textDocument: { uri: d.uri, version: d.version },
          edits: renamed.edits.map((e) => ({ range: range(d, e.span), newText: e.text })),
        },
      ],
    };
  });
  connection.onDocumentSymbol(({ textDocument }) => {
    const d = document(textDocument.uri);
    if (!d) return [];
    return analyze(d.getText()).declarations.map((e) => ({
      name: e.name.text,
      kind: SymbolKind.Enum,
      range: range(d, e.span),
      selectionRange: range(d, e.name.span),
      children: e.values.map((v) => ({
        name: v.text,
        kind: SymbolKind.EnumMember,
        range: range(d, v.span),
        selectionRange: range(d, v.span),
      })),
    }));
  });
  connection.onDocumentFormatting(({ textDocument }) => {
    const d = document(textDocument.uri);
    if (!d) return [];
    const source = d.getText(),
      formatted = format(source);
    return formatted === undefined || formatted === source
      ? []
      : [{ range: range(d, { start: 0, end: source.length }), newText: formatted }];
  });
  connection.languages.semanticTokens.on(({ textDocument }) => {
    const d = document(textDocument.uri),
      builder = new SemanticTokensBuilder();
    if (d)
      for (const token of semanticTokens(d.getText())) {
        const at = d.positionAt(token.span.start);
        builder.push(
          at.line,
          at.character,
          token.span.end - token.span.start,
          token.kind === "enum" ? 0 : 1,
          1,
        );
      }
    return { data: builder.build().data };
  });
  connection.onCodeLens(({ textDocument }) => {
    const d = document(textDocument.uri);
    if (!d) return [];
    const first = analyze(d.getText()).declarations[0];
    return first
      ? [
          {
            range: range(d, first.name.span),
            command: { title: "Check", command: "dxn.run", arguments: [d.uri, ["check"]] },
          },
        ]
      : [];
  });
  documents.listen(connection);
  connection.listen();
}
