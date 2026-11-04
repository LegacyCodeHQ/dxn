#include "tree_sitter/parser.h"
#include <stdbool.h>
#include <string.h>

// Keep in grammar.js externals order. The unused sentinel is valid during
// recovery; declining then prevents zero-width recovery loops.
enum TokenType { DOCUMENTATION_START, ERROR_SENTINEL, COMMA_GAP, PIPE_GAP, CROSS_GAP };
void *tree_sitter_dxn_external_scanner_create(void) { return NULL; }
void tree_sitter_dxn_external_scanner_destroy(void *payload) { (void)payload; }
unsigned tree_sitter_dxn_external_scanner_serialize(void *payload, char *buffer) {
  (void)payload; (void)buffer; return 0;
}
void tree_sitter_dxn_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
  (void)payload; (void)buffer; (void)length;
}
static void advance(TSLexer *lexer) { lexer->advance(lexer, false); }
static void indent(TSLexer *lexer) {
  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') advance(lexer);
}
static void newline(TSLexer *lexer) {
  if (lexer->lookahead == '\r') {
    advance(lexer);
    if (lexer->lookahead == '\n') advance(lexer);
  } else if (lexer->lookahead == '\n') { advance(lexer); }
}
bool tree_sitter_dxn_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid) {
  (void)payload;
  if (valid[ERROR_SENTINEL]) return false;
  if (valid[COMMA_GAP] || valid[PIPE_GAP] || valid[CROSS_GAP]) {
    lexer->mark_end(lexer);
    bool gap = false;
    while (!lexer->eof(lexer)) {
      indent(lexer);
      if (lexer->lookahead == '#') {
        gap = true;
        while (!lexer->eof(lexer) && lexer->lookahead != '\n' && lexer->lookahead != '\r') advance(lexer);
      } else if (lexer->lookahead == '\n' || lexer->lookahead == '\r') {
        gap = true;
        newline(lexer);
      } else break;
    }
    if (gap && lexer->lookahead == ',' && valid[COMMA_GAP]) { lexer->result_symbol = COMMA_GAP; return true; }
    if (gap && lexer->lookahead == '|' && valid[PIPE_GAP]) { lexer->result_symbol = PIPE_GAP; return true; }
    if (gap && lexer->lookahead == 'x' && valid[CROSS_GAP]) { lexer->result_symbol = CROSS_GAP; return true; }
    return false;
  }
  if (!valid[DOCUMENTATION_START]) return false;
  // All reads after this mark are lookahead, so declaration text is not consumed.
  lexer->mark_end(lexer);
  indent(lexer);
  bool documentation = false;
  while (lexer->lookahead == '#') {
    advance(lexer);
    if (lexer->lookahead == '#') documentation = true;
    while (!lexer->eof(lexer) && lexer->lookahead != '\n' && lexer->lookahead != '\r') advance(lexer);
    if (lexer->eof(lexer)) return false;
    newline(lexer);
    indent(lexer);
  }
  if (!documentation) return false;
  char word[8] = {0};
  unsigned length = 0;
  while (lexer->lookahead >= 'a' && lexer->lookahead <= 'z') {
    if (length == sizeof(word) - 1) return false;
    word[length++] = (char)lexer->lookahead;
    advance(lexer);
  }
  if (strcmp(word, "enum") && strcmp(word, "type") && strcmp(word, "state")) return false;
  if (lexer->lookahead != ' ' && lexer->lookahead != '\t') return false;
  lexer->result_symbol = DOCUMENTATION_START;
  return true;
}
