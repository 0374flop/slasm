#ifndef AST_H
#define AST_H

typedef enum {
    EXPR_NUM,
    EXPR_VAR,
    EXPR_BINOP,
    EXPR_UNOP,
    EXPR_ASSIGN,
    EXPR_CALL
} ExprKind;

typedef struct Expr {
    ExprKind kind;
    int num;
    char name[128];
    char op[3];
    struct Expr *lhs;
    struct Expr *rhs;
    struct Expr **args;
    int argCount;
} Expr;

typedef enum {
    STMT_EXPR,
    STMT_DECL,
    STMT_IF,
    STMT_WHILE,
    STMT_RETURN,
    STMT_BLOCK
} StmtKind;

typedef struct Stmt {
    StmtKind kind;
    Expr *expr;
    char declName[128];
    Expr *declInit;
    struct Stmt *thenBranch;
    struct Stmt *elseBranch;
    struct Stmt **stmts;
    int stmtCount;
} Stmt;

typedef struct {
    char name[128];
    char paramNames[16][128];
    int paramCount;
    Stmt *body;
} Function;

typedef struct {
    Function funcs[64];
    int funcCount;
} Program;

Expr *expr_new(ExprKind kind);
Stmt *stmt_new(StmtKind kind);

#endif
