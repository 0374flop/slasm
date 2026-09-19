#ifndef TOKENIZER_H
#define TOKENIZER_H

typedef struct {
    char **items;
    int count;
    int cap;
} TokenList;

void tokenize(const char *src, TokenList *out);
void tokenlist_free(TokenList *t);

#endif
