#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "tokenizer.h"
#include "parser.h"

static char *read_file(const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) {
        fprintf(stderr, "error: cannot open %s\n", path);
        exit(1);
    }
    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);
    char *buf = (char *)malloc(size + 1);
    fread(buf, 1, size, f);
    buf[size] = '\0';
    fclose(f);
    return buf;
}

int main(int argc, char **argv) {
    if (argc < 2) return 1;
    char *src = read_file(argv[1]);
    TokenList tokens;
    tokenize(src, &tokens);
    Program prog;
    parse(&tokens, &prog);
    for (int i = 0; i < tokens.count; i++) printf("T %s\n", tokens.items[i]);
    for (int i = 0; i < prog.icount; i++) printf("I %s\n", prog.instructions[i]);
    for (int i = 0; i < prog.lcount; i++) printf("L %d %s\n", prog.labels[i].ip, prog.labels[i].name);
    return 0;
}
