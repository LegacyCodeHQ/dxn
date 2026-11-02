import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  type CompletionKind,
  completions,
  type DocumentSymbol as Declared,
  definition,
  type Edit,
  folderOf,
  format,
  hover,
  message,
  type ParseResult,
  parse,
  renameAt,
  renameable,
  type StoredFile,
  sourceLines,
  storedFiles,
  symbols,
  tokens,
  usages,
  words,
} from "@legacycodehq/dxn-language";
import {
  CompletionItemKind,
  type Connection,
  DidChangeWatchedFilesNotification,
  type DocumentSymbol,
  MessageType,
  type Range,
  SemanticTokensBuilder,
  ShowMessageNotification,
  SymbolKind,
  TextDocumentSyncKind,
  TextDocuments,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { diagnose } from "./diagnostics.js";
import { evidence, hintsBeside } from "./evidence.js";
import { rangeAt } from "./range.js";

// Serves dxn to an editor over a connection: the problems in each open file,
// published when it opens and whenever it changes, and cleared when it closes;
// where a name in it is declared, and where it is used; what it is; what fits
// where the cursor is; renaming a name, in the file and in the stored records
// beside it; its outline; what each name in it is, for colouring; and how
// much of each element of its trees has evidence.
export function serve(connection: Connection): void {
  const documents = new TextDocuments(TextDocument);
  // Whether the editor takes a link, which names the text it goes from, so
  // that it underlines a whole name, hyphens and all, rather than its words.
  let links = false;
  // Whether the editor can move a folder, as renaming a record moves its
  // stored records'.
  let moves = false;
  // Each open file's parse, with the version it is of: made once for each
  // edit, used by every request until the next, and dropped when the file
  // closes.
  const parses = new Map<string, { version: number; file: ParseResult }>();
  const parsed = (document: TextDocument): ParseResult => {
    const kept = parses.get(document.uri);
    if (kept?.version === document.version) return kept.file;
    const file = parse(document.getText());
    parses.set(document.uri, { version: document.version, file });
    return file;
  };
  // Whether the editor can tell of changes to files on disk, as dxn attach
  // and edits outside the editor make to stored records.
  let watches = false;
  // Whether the editor asks for inlay hints again when told to, as it must
  // when a design or a stored record changes on disk.
  let refreshes = false;
  connection.onInitialize(({ capabilities }) => {
    watches = capabilities.workspace?.didChangeWatchedFiles?.dynamicRegistration === true;
    refreshes = capabilities.workspace?.inlayHint?.refreshSupport === true;
    links = capabilities.textDocument?.definition?.linkSupport === true;
    const edits = capabilities.workspace?.workspaceEdit;
    moves =
      edits?.documentChanges === true && edits.resourceOperations?.includes("rename") === true;
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        definitionProvider: true,
        referencesProvider: true,
        hoverProvider: true,
        inlayHintProvider: true,
        renameProvider: { prepareProvider: true },
        documentSymbolProvider: true,
        documentFormattingProvider: true,
        codeLensProvider: { resolveProvider: false },
        semanticTokensProvider: {
          legend: { tokenTypes, tokenModifiers: ["declaration"] },
          full: true,
        },
        // Typing a name asks on its own; a dot starts the next part of a path.
        completionProvider: { triggerCharacters: ["."] },
      },
    };
  });
  // Problems are of the version they are published for, so an editor can tell
  // ones that are late.
  connection.onInitialized(() => {
    if (!watches) return;
    void connection.client.register(DidChangeWatchedFilesNotification.type, {
      watchers: [{ globPattern: "**/*.json" }, { globPattern: "**/*.pen" }],
    });
  });
  // The stored records each open file's problems were published for, so those
  // no longer there, or the file's when it closes, are cleared.
  const checked = new Map<string, Set<string>>();
  const checkEvidence = (document: TextDocument) => {
    const { uri: own, version } = document;
    const diagnostics = diagnose(document.getText(), parsed(document));
    const found = evidence(own, parsed(document), document.getText());
    // The file's own problems, with those its evidence finds in the model.
    connection.sendDiagnostics({
      uri: own,
      version,
      diagnostics: [...diagnostics, ...(found?.get(own) ?? [])],
    });
    // A file with problems keeps what was found last, rather than flicker
    // while it is typed.
    if (found === undefined) return;
    found.delete(own);
    const before = checked.get(own) ?? new Set<string>();
    for (const uri of before) {
      if (!found.has(uri)) connection.sendDiagnostics({ uri, diagnostics: [] });
    }
    for (const [uri, diagnostics] of found) connection.sendDiagnostics({ uri, diagnostics });
    checked.set(own, new Set(found.keys()));
  };
  documents.onDidChangeContent(({ document }) => checkEvidence(document));
  documents.onDidClose(({ document }) => {
    parses.delete(document.uri);
    connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
    for (const uri of checked.get(document.uri) ?? []) {
      connection.sendDiagnostics({ uri, diagnostics: [] });
    }
    checked.delete(document.uri);
  });
  // A stored record or a design changed on disk: the open files' records are
  // checked again, and their evidence counted again.
  connection.onDidChangeWatchedFiles(() => {
    for (const document of documents.all()) checkEvidence(document);
    if (refreshes) void connection.languages.inlayHint.refresh();
  });
  // After each element of the trees, at the end of the line its name is on,
  // how much of it has evidence.
  connection.languages.inlayHint.on(({ textDocument, range }) => {
    const document = documents.get(textDocument.uri);
    if (document === undefined) return null;
    const lines = sourceLines(document.getText());
    return (
      (hintsBeside(document.uri, parsed(document)) ?? [])
        // A usage of a component has its count on the component, and over its
        // name.
        .filter(
          ({ line, usage }) => !usage && line - 1 >= range.start.line && line - 1 <= range.end.line,
        )
        .map(({ line, label }) => ({
          position: { line: line - 1, character: (lines[line - 1] ?? "").trimEnd().length },
          label,
          paddingLeft: true,
        }))
    );
  });
  connection.onDefinition(({ textDocument, position }) => {
    const document = documents.get(textDocument.uri);
    if (document === undefined) return null;
    const text = document.getText();
    const found = definition(text, position.line + 1, position.character + 1, parsed(document));
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
    const found = usages(
      document.getText(),
      position.line + 1,
      position.character + 1,
      parsed(document),
    );
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
    const file = parsed(document);
    const text = sourceLines(document.getText())[position.line] ?? "";
    // The length of the name written at a column, path parts and all.
    const named = (column: number) =>
      text.slice(column - 1).match(/^[A-Za-z0-9.-]+/)?.[0].length ?? 0;
    const over = (line: number, column: number) =>
      line - 1 === position.line &&
      position.character >= column - 1 &&
      position.character <= column - 1 + named(column);
    const hints = hintsBeside(document.uri, file) ?? [];
    // On a type's name where it is declared: what is left of its evidence.
    const declared = hints.find(
      (hint) =>
        over(hint.line, hint.column) &&
        file.types.some(({ line, column }) => line === hint.line && column === hint.column),
    );
    if (declared !== undefined) {
      const start = { line: declared.line - 1, character: declared.column - 1 };
      return {
        contents: { kind: "markdown", value: declared.details },
        range: { start, end: { ...start, character: start.character + named(declared.column) } },
      };
    }
    const found = hover(document.getText(), position.line + 1, position.character + 1, file);
    if (found === undefined) return null;
    const { line, column, length } = found.from;
    const comment = found.comment === undefined ? "" : `\n\n${found.comment}`;
    // On a child's type on a has line: the type, and the child's evidence
    // there, which a has line has over its type's name, not over the child's.
    const child = file.types
      .flatMap(({ children }) => children)
      .find((each) => over(each.type.line, each.type.column));
    const placed =
      child === undefined
        ? undefined
        : hints.find((hint) => hint.line === child.line && hint.column === child.column);
    const evidence = placed === undefined ? "" : `\n\n---\n\n${placed.details}`;
    return {
      contents: {
        kind: "markdown",
        value: `\`\`\`dxn\n${found.code}\n\`\`\`${comment}${evidence}`,
      },
      range: {
        start: { line: line - 1, character: column - 1 },
        end: { line: line - 1, character: column - 1 + length },
      },
    };
  });
  // Why a rename cannot be done, as a message: an editor shows a message,
  // where it may only log a request that failed. Nothing is renamed.
  const refuse = (reason: string) => {
    connection.sendNotification(ShowMessageNotification.type, {
      type: MessageType.Error,
      message: reason,
    });
    return null;
  };
  connection.onPrepareRename(({ textDocument, position }) => {
    const document = documents.get(textDocument.uri);
    if (document === undefined) return null;
    const found = renameable(
      document.getText(),
      position.line + 1,
      position.character + 1,
      parsed(document),
    );
    if ("refusal" in found) return refuse(found.refusal);
    return { range: rangeOf(found.from), placeholder: found.name };
  });
  connection.onRenameRequest(({ textDocument, position, newName }) => {
    const document = documents.get(textDocument.uri);
    if (document === undefined) return null;
    const text = document.getText();
    const renamed = renameAt(
      text,
      position.line + 1,
      position.character + 1,
      newName,
      storedBeside(textDocument.uri, parsed(document)),
      parsed(document),
    );
    if ("refusal" in renamed) return refuse(renamed.refusal);
    const changes: Record<string, { range: Range; newText: string }[]> = {
      [textDocument.uri]: renamed.edits.map(({ line, column, length, text: newText }) => ({
        range: rangeOf({ line, column, length }),
        newText,
      })),
    };
    // A stored file is replaced whole, keeping its layout but for the values.
    for (const data of renamed.data) {
      const before = sourceLines(readFileSync(data.path, "utf8"));
      changes[pathToFileURL(data.path).href] = [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: before.length - 1, character: (before.at(-1) ?? "").length },
          },
          newText: data.source,
        },
      ];
    }
    // A record's stored records move to the folder named after its new name.
    const { folder } = renamed;
    const directory = textDocument.uri.startsWith("file:")
      ? dirname(fileURLToPath(textDocument.uri))
      : undefined;
    if (folder === undefined || folder.from === folder.to || directory === undefined) {
      return { changes };
    }
    const from = join(directory, folder.from);
    const to = join(directory, folder.to);
    if (!isFolder(from)) return { changes };
    const record =
      renamed.edits.length > 0 ? document.getText(rangeOf(renamed.edits[0] as Edit)) : "";
    if (existsSync(to)) {
      return refuse(
        message`${words(folder.to)}/ is already next to the file; ${record}'s stored records cannot move there`,
      );
    }
    if (!moves) {
      return refuse(
        message`the editor cannot move ${words(folder.from)}/, where ${record}'s stored records are, to ${words(folder.to)}/`,
      );
    }
    return {
      documentChanges: [
        {
          textDocument: { uri: textDocument.uri, version: document.version },
          edits: changes[textDocument.uri] ?? [],
        },
        {
          kind: "rename" as const,
          oldUri: pathToFileURL(from).href,
          newUri: pathToFileURL(to).href,
        },
      ],
    };
  });
  connection.onDocumentSymbol(({ textDocument }) => {
    const document = documents.get(textDocument.uri);
    if (document === undefined) return null;
    const editor = (symbol: Declared): DocumentSymbol => ({
      name: symbol.name,
      detail: symbol.kind,
      kind: symbolKinds[symbol.kind] ?? SymbolKind.Variable,
      range: {
        start: { line: symbol.start.line - 1, character: symbol.start.column - 1 },
        end: { line: symbol.end.line - 1, character: symbol.end.column - 1 },
      },
      selectionRange: rangeOf(symbol.at),
      children: symbol.children.map(editor),
    });
    return symbols(document.getText(), parsed(document)).map(editor);
  });
  // The one way the file is written, as dxn fmt writes it, in one edit: none
  // when it is written that way, or does not parse. The editor's tab size is
  // not asked: every file is written alike.
  connection.onDocumentFormatting(({ textDocument }) => {
    const document = documents.get(textDocument.uri);
    if (document === undefined) return null;
    const text = document.getText();
    const formatted = format(text);
    if (formatted === undefined || formatted === text) return [];
    return [
      {
        range: { start: { line: 0, character: 0 }, end: document.positionAt(text.length) },
        newText: formatted,
      },
    ];
  });
  // What can be run from where it is declared: a type's states, by its full
  // name, and an expectation, by its title. An editor that has the dxn.run
  // command runs dxn with these arguments, and the file.
  connection.onCodeLens(({ textDocument }) => {
    const document = documents.get(textDocument.uri);
    if (document === undefined) return null;
    const lens = (symbol: Declared, title: string, args: string[]) => ({
      range: rangeOf(symbol.at),
      command: { title, command: "dxn.run", arguments: [textDocument.uri, args] },
    });
    const lenses = (list: Declared[], around: string[]): ReturnType<typeof lens>[] =>
      list.flatMap((symbol) => {
        if (symbol.kind === "expectation")
          return [lens(symbol, "Run", ["check", "--expect", symbol.name])];
        if (symbol.kind !== "type") return [];
        const name = [...around, symbol.name];
        return [
          lens(symbol, "Run states", ["states", name.join(".")]),
          ...lenses(symbol.children, name),
        ];
      });
    return lenses(symbols(document.getText(), parsed(document)), []);
  });
  // What each name is, so an editor colours it by that, not by how it looks.
  connection.languages.semanticTokens.on(({ textDocument }) => {
    const document = documents.get(textDocument.uri);
    const builder = new SemanticTokensBuilder();
    if (document === undefined) return builder.build();
    for (const token of tokens(document.getText(), parsed(document))) {
      const type = tokenTypes.indexOf(tokenTypeOf[token.kind] ?? "variable");
      builder.push(token.line - 1, token.column - 1, token.length, type, token.declaration ? 1 : 0);
    }
    return builder.build();
  });
  connection.onCompletion(({ textDocument, position }) => {
    const document = documents.get(textDocument.uri);
    if (document === undefined) return null;
    return completions(
      document.getText(),
      position.line + 1,
      position.character + 1,
      parsed(document),
    ).map(({ label, kind }) => ({ label, kind: kinds[kind], detail: kind }));
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

// The range of a span, both from one, as an editor's, from zero.
function rangeOf({
  line,
  column,
  length,
}: {
  line: number;
  column: number;
  length: number;
}): Range {
  return {
    start: { line: line - 1, character: column - 1 },
    end: { line: line - 1, character: column - 1 + length },
  };
}

// The stored records of a file's records, by convention: the JSON files in each
// record's folder, next to the file. None for a file that is not on disk.
function storedBeside(uri: string, file: ParseResult): StoredFile[] {
  if (!uri.startsWith("file:")) return [];
  const directory = dirname(fileURLToPath(uri));
  const records = [...new Set(file.records.map(({ name }) => name))];
  return records.flatMap((record) =>
    (storedFiles(directory, record) ?? []).map((name) => {
      const path = join(directory, folderOf(record), name);
      return { record, path, source: readFileSync(path, "utf8") };
    }),
  );
}

// Whether a path is a folder.
const isFolder = (path: string) =>
  statSync(path, { throwIfNoEntry: false })?.isDirectory() === true;

// How an editor shows each kind of declaration in an outline.
const symbolKinds: Record<string, SymbolKind> = {
  enum: SymbolKind.Enum,
  dimension: SymbolKind.Enum,
  type: SymbolKind.Class,
  record: SymbolKind.Struct,
  environment: SymbolKind.Module,
  profile: SymbolKind.Object,
  modifier: SymbolKind.Object,
  expectation: SymbolKind.Event,
  state: SymbolKind.Field,
  event: SymbolKind.Event,
  action: SymbolKind.Method,
  child: SymbolKind.Property,
  field: SymbolKind.Field,
  actor: SymbolKind.Interface,
};

// The token types an editor colours names by, as the protocol names them, and
// each kind of declaration's.
const tokenTypes = [
  "enum",
  "class",
  "struct",
  "namespace",
  "enumMember",
  "property",
  "method",
  "event",
  "variable",
];
const tokenTypeOf: Record<string, string> = {
  enum: "enum",
  dimension: "enum",
  type: "class",
  record: "struct",
  environment: "namespace",
  value: "enumMember",
  state: "property",
  child: "property",
  field: "property",
  action: "method",
  event: "event",
  profile: "class",
  modifier: "class",
  actor: "class",
};
