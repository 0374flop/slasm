#ifndef PARSER_H
#define PARSER_H

#include "tokenizer.h"

typedef struct {
    int ip;
    char *name;
} Label;

typedef struct {
    char **instructions;
    int icount;
    int icap;
    Label *labels;
    int lcount;
    int lcap;
} Program;

void parse(const TokenList *tokens, Program *out);
void program_free(Program *p);

#endif
