#include <stdlib.h>
#include <string.h>
#include "ast.h"

Expr *expr_new(ExprKind kind) {
    Expr *e = (Expr *)calloc(1, sizeof(Expr));
    e->kind = kind;
    return e;
}

Stmt *stmt_new(StmtKind kind) {
    Stmt *s = (Stmt *)calloc(1, sizeof(Stmt));
    s->kind = kind;
    return s;
}
