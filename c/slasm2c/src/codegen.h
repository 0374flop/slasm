#ifndef SLASM2C_CODEGEN_H
#define SLASM2C_CODEGEN_H

#include <stdio.h>
#include "parser.h"

/* Write a standalone C program that executes program with slasm_rt.h. */
void codegen_program(const Program *program, FILE *out);

#endif
