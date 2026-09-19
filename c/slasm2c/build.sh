#!/bin/sh
set -eu
cd "$(dirname "$0")"
gcc -std=c11 -Wall -Wextra -Werror -O2 -o slasm2c \
    src/main.c src/tokenizer.c src/parser.c src/codegen.c
