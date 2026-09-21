#!/bin/sh
set -eu
cd "$(dirname "$0")"
gcc -std=c11 -Wall -Wextra -Werror -O2 -o vm \
    src/main.c src/tokenizer.c src/parser.c src/vm.c -lm
