#!/bin/bash
gcc -std=c11 -Wall -o c2slasm src/main.c src/lexer.c src/parser.c src/ast.c src/codegen.c