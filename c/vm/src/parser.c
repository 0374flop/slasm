#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "parser.h"

static char *dup_range(const char *s, int len) {
    char *p = (char *)malloc(len + 1);
    memcpy(p, s, len);
    p[len] = '\0';
    return p;
}

static void add_instruction(Program *p, const char *s) {
    if (p->icount == p->icap) {
        p->icap = p->icap ? p->icap * 2 : 64;
        p->instructions = (char **)realloc(p->instructions, sizeof(char *) * p->icap);
    }
    p->instructions[p->icount++] = dup_range(s, (int)strlen(s));
}

static void add_label(Program *p, int ip, const char *name, int len) {
    if (p->lcount == p->lcap) {
        p->lcap = p->lcap ? p->lcap * 2 : 16;
        p->labels = (Label *)realloc(p->labels, sizeof(Label) * p->lcap);
    }
    p->labels[p->lcount].ip = ip;
    p->labels[p->lcount].name = dup_range(name, len);
    p->lcount++;
}

void parse(const TokenList *tokens, Program *out) {
    memset(out, 0, sizeof(*out));

    char **ops = NULL;
    int opcount = 0;
    int opcap = 0;

    int pos = 0;
    while (pos < tokens->count) {
        const char *tok = tokens->items[pos++];
        int len = (int)strlen(tok);

        if (strcmp(tok, "(") == 0) {
            if (opcount == opcap) {
                opcap = opcap ? opcap * 2 : 32;
                ops = (char **)realloc(ops, sizeof(char *) * opcap);
            }
            ops[opcount++] = (char *)(pos < tokens->count ? tokens->items[pos++] : "");
            continue;
        }

        if (strcmp(tok, ")") == 0) {
            if (opcount == 0) {
                fprintf(stderr, "unexpected ')'\n");
                exit(1);
            }
            add_instruction(out, ops[--opcount]);
            continue;
        }

        if (tok[0] == ';' && tok[len - 1] == ';') {
            const char *inner = tok + 1;
            int ilen = len - 2;
            if (ilen >= 2 && inner[0] == '-' && inner[ilen - 1] == '-') {
                add_label(out, out->icount + 1, inner + 1, ilen - 2);
            }
            continue;
        }

        add_instruction(out, "push");
        add_instruction(out, tok);
    }

    if (opcount > 0) {
        fprintf(stderr, "Unclosed '('\n");
        exit(1);
    }

    free(ops);
}

void program_free(Program *p) {
    for (int i = 0; i < p->icount; i++) free(p->instructions[i]);
    free(p->instructions);
    for (int i = 0; i < p->lcount; i++) free(p->labels[i].name);
    free(p->labels);
    memset(p, 0, sizeof(*p));
}
