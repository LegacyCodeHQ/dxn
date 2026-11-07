import {
  analyze,
  combinationCounts,
  format,
  isRecord,
  isType,
  listCombinations,
  type Problem,
  quickFixes,
  referencesAt,
  renameAt,
  renderCombinationTables,
  type Span,
  semanticTokens,
  symbolAt,
} from "@legacycodehq/dxn-next";
import {
  CodeActionKind,
  type Connection,
  type Diagnostic,
  ErrorCodes,
  type Range,
  ResponseError,
  SemanticTokensBuilder,
  ShowMessageNotification,
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
  const diagnostic = (d: TextDocument, p: Problem, at: Span): Diagnostic => ({
    range: range(d, at),
    severity: 1,
    code: p.code,
    ...(p.rule
      ? { data: { rule: p.rule, ...(p.suggestion ? { suggestion: p.suggestion } : {}) } }
      : {}),
    message: p.message,
    source: "dxn",
  });
  const publish = (d: TextDocument) => {
    if (d.languageId !== "dxn") return;
    connection.sendDiagnostics({
      uri: d.uri,
      version: d.version,
      diagnostics: analyze(d.getText()).problems.flatMap((p) =>
        p.at.map((at) => diagnostic(d, p, at)),
      ),
    });
  };
  let tableClient = false;
  connection.onInitialize((params) => {
    tableClient = params.initializationOptions?.combinationTables === true;
    return {
      capabilities: {
        executeCommandProvider: { commands: ["dxn.combinations"] },
        textDocumentSync: TextDocumentSyncKind.Incremental,
        codeActionProvider: { codeActionKinds: [CodeActionKind.QuickFix] },
        hoverProvider: true,
        definitionProvider: true,
        referencesProvider: true,
        documentSymbolProvider: true,
        documentFormattingProvider: true,
        renameProvider: { prepareProvider: true },
        codeLensProvider: { resolveProvider: false },
        semanticTokensProvider: {
          legend: {
            tokenTypes: ["enum", "enumMember", "type", "property", "struct"],
            tokenModifiers: ["declaration"],
          },
          full: true,
        },
      },
    };
  });
  documents.onDidChangeContent(({ document: d }) => publish(d));
  documents.onDidClose(({ document: d }) =>
    connection.sendDiagnostics({ uri: d.uri, diagnostics: [] }),
  );
  connection.onCodeAction(({ textDocument, range: selection, context }) => {
    if (
      context.only?.length &&
      !context.only.some((kind) => kind === "" || kind === CodeActionKind.QuickFix)
    )
      return [];
    const d = document(textDocument.uri);
    if (!d) return [];
    return quickFixes(d.getText(), {
      start: d.offsetAt(selection.start),
      end: d.offsetAt(selection.end),
    }).map((fix) => ({
      title: fix.title,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic(d, fix.problem, fix.at)],
      edit: {
        documentChanges: [
          {
            textDocument: { uri: d.uri, version: d.version },
            edits: fix.edits.map((e) => ({ range: range(d, e.span), newText: e.text })),
          },
        ],
      },
    }));
  });
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
    return symbol?.definition ? { uri: d.uri, range: range(d, symbol.definition) } : null;
  });
  connection.onReferences(({ textDocument, position, context }) => {
    const d = document(textDocument.uri);
    if (!d) return [];
    return referencesAt(d.getText(), d.offsetAt(position), context.includeDeclaration).map(
      (at) => ({ uri: d.uri, range: range(d, at) }),
    );
  });
  connection.onPrepareRename(({ textDocument, position }) => {
    const d = document(textDocument.uri);
    if (!d) return null;
    const symbol = symbolAt(d.getText(), d.offsetAt(position));
    return symbol &&
      ["enum", "enumReference", "type", "record", "recordReference"].includes(symbol.kind)
      ? { range: range(d, symbol.span), placeholder: symbol.name }
      : null;
  });
  connection.onRenameRequest(({ textDocument, position, newName }) => {
    const d = document(textDocument.uri);
    if (!d) return null;
    const renamed = renameAt(d.getText(), d.offsetAt(position), newName);
    if (!renamed)
      throw new ResponseError(
        ErrorCodes.InvalidParams,
        "only declaration names and references can be renamed",
      );
    if (!renamed.file)
      throw new ResponseError(ErrorCodes.InvalidParams, JSON.stringify(renamed.refusals), {
        refusals: renamed.refusals,
      });
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
      kind: isType(e) || isRecord(e) ? SymbolKind.Struct : SymbolKind.Enum,
      range: range(d, e.span),
      selectionRange: range(d, e.name.span),
      children: isRecord(e)
        ? e.fields.map((f) => ({
            name: f.name.text,
            detail: f.type.text,
            kind: SymbolKind.Field,
            range: range(d, { start: f.name.span.start, end: f.type.span.end }),
            selectionRange: range(d, f.name.span),
          }))
        : (isType(e) ? e.varies : e.values).map((v) => ({
            name: v.text,
            kind: isType(e) ? SymbolKind.Enum : SymbolKind.EnumMember,
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
          ["enum", "enumMember", "type", "property", "struct"].indexOf(token.kind),
          token.declaration ? 1 : 0,
        );
      }
    return { data: builder.build().data };
  });
  connection.onExecuteCommand(({ command, arguments: args }) => {
    const [uri, type] = args ?? [];
    if (command !== "dxn.combinations" || typeof uri !== "string" || typeof type !== "string")
      throw new ResponseError(
        ErrorCodes.InvalidParams,
        "expected an open DXN document and a type name",
      );
    const d = document(uri);
    if (!d) throw new ResponseError(ErrorCodes.InvalidParams, "the DXN document is not open");
    const result = listCombinations(d.getText(), type);
    if (result.kind === "invalid")
      throw new ResponseError(ErrorCodes.InvalidParams, result.message, {
        problems: result.problems,
      });
    if (result.kind === "unknownType")
      throw new ResponseError(ErrorCodes.InvalidParams, result.message, {
        types: result.available,
      });
    const table = renderCombinationTables(result.types);
    // VS Code opens a plaintext buffer. Generic LSP clients display the same table as an info message.
    if (!tableClient)
      connection.sendNotification(ShowMessageNotification.type, { type: 3, message: table });
    return { types: result.types, table };
  });
  connection.onCodeLens(({ textDocument }) => {
    const d = document(textDocument.uri);
    if (!d) return [];
    const first = analyze(d.getText()).declarations[0];
    const counts = combinationCounts(d.getText()).map((t) => ({
      range: range(d, t.span),
      command: {
        title: `${t.count} ${t.count === "1" ? "combination" : "combinations"}`,
        command: "dxn.combinations",
        arguments: [d.uri, t.type],
      },
    }));
    return [
      ...(first
        ? [
            {
              range: range(d, first.name.span),
              command: { title: "Check", command: "dxn.run", arguments: [d.uri, ["check"]] },
            },
          ]
        : []),
      ...counts,
    ];
  });
  documents.listen(connection);
  connection.listen();
}
