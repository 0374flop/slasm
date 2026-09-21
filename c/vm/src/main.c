#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "tokenizer.h"
#include "parser.h"
#include "vm.h"

static char *read_file(const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) { fprintf(stderr, "error: cannot open %s\n", path); exit(1); }
    if (fseek(f, 0, SEEK_END) != 0) { fprintf(stderr, "error: cannot read %s\n", path); exit(1); }
    long size = ftell(f);
    if (size < 0 || fseek(f, 0, SEEK_SET) != 0) { fprintf(stderr, "error: cannot read %s\n", path); exit(1); }
    char *buf = malloc((size_t)size + 1);
    if (!buf || fread(buf, 1, (size_t)size, f) != (size_t)size) { fprintf(stderr, "error: cannot read %s\n", path); exit(1); }
    buf[size] = '\0';
    fclose(f);
    return buf;
}

int main(int argc, char **argv) {
    const char *input = NULL;
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "-h") == 0 || strcmp(argv[i], "--help") == 0) {
            puts("usage: vm <input.slasm>");
            return 0;
        } else if (!input) input = argv[i];
        else { fprintf(stderr, "error: unexpected argument: %s\n", argv[i]); return 1; }
    }
    if (!input) { fprintf(stderr, "usage: vm <input.slasm>\n"); return 1; }

    char *source = read_file(input);
    TokenList tokens;
    Program program;
    tokenize(source, &tokens);
    parse(&tokens, &program);

    vm_run(&program);

    program_free(&program);
    tokenlist_free(&tokens);
    free(source);
    return 0;
}
