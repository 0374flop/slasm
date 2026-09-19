#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "parser.h"
#include "codegen.h"

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
    const char *inputPath = NULL;
    const char *outputPath = "out.slasm";

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "-o") == 0 && i + 1 < argc) {
            outputPath = argv[++i];
        } else {
            inputPath = argv[i];
        }
    }

    if (!inputPath) {
        fprintf(stderr, "usage: c2slasm <input.c> -o <output.slasm>\n");
        return 1;
    }

    char *src = read_file(inputPath);

    Parser p;
    parser_init(&p, src);
    Program *prog = parser_parse_program(&p);

    FILE *out = fopen(outputPath, "w");
    if (!out) {
        fprintf(stderr, "error: cannot open %s for writing\n", outputPath);
        return 1;
    }
    codegen_program(prog, out);
    fclose(out);

    printf("compiled %s -> %s\n", inputPath, outputPath);
    return 0;
}
