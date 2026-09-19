#ifndef LEXER_H
#define LEXER_H

typedef enum {
    TOK_EOF,
    TOK_INT,
    TOK_IDENT,
    TOK_NUM,
    TOK_LPAREN,
    TOK_RPAREN,
    TOK_LBRACE,
    TOK_RBRACE,
    TOK_SEMI,
    TOK_COMMA,
    TOK_ASSIGN,
    TOK_PLUS,
    TOK_MINUS,
    TOK_STAR,
    TOK_SLASH,
    TOK_PERCENT,
    TOK_LT,
    TOK_GT,
    TOK_EQ,
    TOK_NEQ,
    TOK_AND,
    TOK_OR,
    TOK_NOT,
    TOK_IF,
    TOK_ELSE,
    TOK_WHILE,
    TOK_RETURN,
    TOK_VOID
} TokenType;

typedef struct {
    TokenType type;
    char text[256];
    int line;
} Token;

typedef struct {
    const char *src;
    int pos;
    int line;
} Lexer;

void lexer_init(Lexer *lx, const char *src);
Token lexer_next(Lexer *lx);

#endif
