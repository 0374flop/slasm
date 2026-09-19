#ifndef PARSER_H
#define PARSER_H

#include "lexer.h"
#include "ast.h"

typedef struct {
    Lexer lx;
    Token cur;
} Parser;

void parser_init(Parser *p, const char *src);
Program *parser_parse_program(Parser *p);

#endif
