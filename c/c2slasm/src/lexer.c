#include <ctype.h>
#include <string.h>
#include "lexer.h"

void lexer_init(Lexer *lx, const char *src) {
    lx->src = src;
    lx->pos = 0;
    lx->line = 1;
}

static char peekc(Lexer *lx) {
    return lx->src[lx->pos];
}

static char advc(Lexer *lx) {
    char c = lx->src[lx->pos];
    if (c == '\n') lx->line++;
    lx->pos++;
    return c;
}

static void skip_ws_and_comments(Lexer *lx) {
    for (;;) {
        char c = peekc(lx);
        if (c == ' ' || c == '\t' || c == '\r' || c == '\n') {
            advc(lx);
            continue;
        }
        if (c == '/' && lx->src[lx->pos + 1] == '/') {
            while (peekc(lx) != '\n' && peekc(lx) != '\0') advc(lx);
            continue;
        }
        if (c == '/' && lx->src[lx->pos + 1] == '*') {
            advc(lx); advc(lx);
            while (!(peekc(lx) == '*' && lx->src[lx->pos + 1] == '/') && peekc(lx) != '\0') advc(lx);
            if (peekc(lx) != '\0') { advc(lx); advc(lx); }
            continue;
        }
        break;
    }
}

static TokenType keyword_or_ident(const char *text, char *outText) {
    strcpy(outText, text);
    if (strcmp(text, "int") == 0) return TOK_INT;
    if (strcmp(text, "void") == 0) return TOK_VOID;
    if (strcmp(text, "if") == 0) return TOK_IF;
    if (strcmp(text, "else") == 0) return TOK_ELSE;
    if (strcmp(text, "while") == 0) return TOK_WHILE;
    if (strcmp(text, "return") == 0) return TOK_RETURN;
    return TOK_IDENT;
}

Token lexer_next(Lexer *lx) {
    skip_ws_and_comments(lx);
    Token t;
    t.line = lx->line;
    t.text[0] = '\0';

    char c = peekc(lx);

    if (c == '\0') { t.type = TOK_EOF; return t; }

    if (isalpha((unsigned char)c) || c == '_') {
        char buf[256];
        int i = 0;
        while (isalnum((unsigned char)peekc(lx)) || peekc(lx) == '_') {
            buf[i++] = advc(lx);
        }
        buf[i] = '\0';
        t.type = keyword_or_ident(buf, t.text);
        return t;
    }

    if (isdigit((unsigned char)c)) {
        char buf[256];
        int i = 0;
        while (isdigit((unsigned char)peekc(lx))) {
            buf[i++] = advc(lx);
        }
        buf[i] = '\0';
        t.type = TOK_NUM;
        strcpy(t.text, buf);
        return t;
    }

    advc(lx);
    switch (c) {
        case '(': t.type = TOK_LPAREN; return t;
        case ')': t.type = TOK_RPAREN; return t;
        case '{': t.type = TOK_LBRACE; return t;
        case '}': t.type = TOK_RBRACE; return t;
        case ';': t.type = TOK_SEMI; return t;
        case ',': t.type = TOK_COMMA; return t;
        case '+': t.type = TOK_PLUS; return t;
        case '-': t.type = TOK_MINUS; return t;
        case '*': t.type = TOK_STAR; return t;
        case '/': t.type = TOK_SLASH; return t;
        case '%': t.type = TOK_PERCENT; return t;
        case '<': t.type = TOK_LT; return t;
        case '>': t.type = TOK_GT; return t;
        case '!':
            if (peekc(lx) == '=') { advc(lx); t.type = TOK_NEQ; return t; }
            t.type = TOK_NOT; return t;
        case '=':
            if (peekc(lx) == '=') { advc(lx); t.type = TOK_EQ; return t; }
            t.type = TOK_ASSIGN; return t;
        case '&':
            if (peekc(lx) == '&') { advc(lx); t.type = TOK_AND; return t; }
            break;
        case '|':
            if (peekc(lx) == '|') { advc(lx); t.type = TOK_OR; return t; }
            break;
    }

    t.type = TOK_EOF;
    return t;
}
