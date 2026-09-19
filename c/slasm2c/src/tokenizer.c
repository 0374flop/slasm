#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "tokenizer.h"

static void push_token(TokenList *t, const char *s, int len) {
    if (t->count == t->cap) {
        t->cap = t->cap ? t->cap * 2 : 64;
        t->items = (char **)realloc(t->items, sizeof(char *) * t->cap);
    }
    char *copy = (char *)malloc(len + 1);
    memcpy(copy, s, len);
    copy[len] = '\0';
    t->items[t->count++] = copy;
}

static int is_space(char c) {
    return c == ' ' || c == '\n' || c == '\t' || c == '\r';
}

void tokenize(const char *src, TokenList *out) {
    out->items = NULL;
    out->count = 0;
    out->cap = 0;

    int i = 0;
    int line = 1;
    int start = -1;
    int n = (int)strlen(src);

    while (i < n) {
        char c = src[i];

        if (c == ';') {
            if (start >= 0) {
                push_token(out, src + start, i - start);
                start = -1;
            }
            int startLine = line;
            int j = i + 1;
            while (j < n && src[j] != ';') {
                if (is_space(src[j])) {
                    fprintf(stderr, "line %d: whitespace inside ';...;' block\n", startLine);
                    exit(1);
                }
                j++;
            }
            if (j >= n) {
                fprintf(stderr, "line %d: unclosed ';' block\n", startLine);
                exit(1);
            }
            push_token(out, src + i, j - i + 1);
            i = j + 1;
            continue;
        }

        if (is_space(c)) {
            if (start >= 0) {
                push_token(out, src + start, i - start);
                start = -1;
            }
            if (c == '\n') line++;
        } else if (c == '(' || c == ')') {
            if (start >= 0) {
                push_token(out, src + start, i - start);
                start = -1;
            }
            push_token(out, src + i, 1);
        } else if (start < 0) {
            start = i;
        }

        i++;
    }

    if (start >= 0) push_token(out, src + start, n - start);
}

void tokenlist_free(TokenList *t) {
    for (int i = 0; i < t->count; i++) free(t->items[i]);
    free(t->items);
    t->items = NULL;
    t->count = 0;
    t->cap = 0;
}
