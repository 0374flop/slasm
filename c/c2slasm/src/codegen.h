#ifndef CODEGEN_H
#define CODEGEN_H

#include <stdio.h>
#include "ast.h"

void codegen_program(Program *prog, FILE *out);

#endif
