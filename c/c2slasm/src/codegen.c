#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "codegen.h"

#define MAX_VARS 512
#define MAX_FUNCS 64
#define NAME_BUF_SIZE 128

typedef struct {
    char name[NAME_BUF_SIZE];
    char funcName[NAME_BUF_SIZE];
    int reg;
} VarEntry;

static VarEntry g_vars[MAX_VARS];
static int g_varCount = 0;
static int g_nextReg = 100;

typedef struct {
    char name[NAME_BUF_SIZE];
    int retReg;
} FuncEntry;

static FuncEntry g_funcs[MAX_FUNCS];
static int g_funcCount = 0;
static Program *g_prog;

static Function *find_function_decl(const char *name) {
    for (int i = 0; i < g_prog->funcCount; i++) {
        if (strcmp(g_prog->funcs[i].name, name) == 0) return &g_prog->funcs[i];
    }
    return NULL;
}

static int g_labelCounter = 0;
static const char *g_curFunc;

static int reg_for(const char *funcName, const char *varName) {
    for (int i = 0; i < g_varCount; i++) {
        if (strcmp(g_vars[i].funcName, funcName) == 0 && strcmp(g_vars[i].name, varName) == 0) {
            return g_vars[i].reg;
        }
    }

    if (g_varCount >= MAX_VARS) {
        fprintf(stderr, "codegen error: maximum variable limit (%d) reached\n", MAX_VARS);
        exit(1);
    }

    snprintf(g_vars[g_varCount].funcName, NAME_BUF_SIZE, "%s", funcName);
    snprintf(g_vars[g_varCount].name, NAME_BUF_SIZE, "%s", varName);
    g_vars[g_varCount].reg = g_nextReg++;
    return g_vars[g_varCount++].reg;
}

static int retreg_for(const char *funcName) {
    for (int i = 0; i < g_funcCount; i++) {
        if (strcmp(g_funcs[i].name, funcName) == 0) return g_funcs[i].retReg;
    }

    if (g_funcCount >= MAX_FUNCS) {
        fprintf(stderr, "codegen error: maximum function limit (%d) reached\n", MAX_FUNCS);
        exit(1);
    }

    snprintf(g_funcs[g_funcCount].name, NAME_BUF_SIZE, "%s", funcName);
    g_funcs[g_funcCount].retReg = g_nextReg++;
    return g_funcs[g_funcCount++].retReg;
}

static int addrreg_for(const char *funcName) {
    char key[NAME_BUF_SIZE];
    snprintf(key, sizeof(key), "__retaddr_%s", funcName);
    return reg_for("__global__", key);
}

static void new_label(char *buf, const char *prefix) {
    snprintf(buf, NAME_BUF_SIZE, "%s_%d", prefix, g_labelCounter++);
}

static void emit_label(FILE *out, const char *label) {
    fprintf(out, ";-%s-;\n", label);
}

static void gen_expr(Expr *e, FILE *out);

/* Корректный вывод для записи: (W key val) */
static void emit_write_var(int reg, Expr *valExpr, FILE *out) {
    fprintf(out, "(W %d ", reg);
    if (valExpr) {
        gen_expr(valExpr, out);
    } else {
        fprintf(out, "0");
    }
    fprintf(out, ")\n");
}

static void gen_binop(Expr *e, FILE *out) {
    fprintf(out, "(%s ", strcmp(e->op, "==") == 0 ? "=" : e->op);
    gen_expr(e->lhs, out);
    fprintf(out, " ");
    gen_expr(e->rhs, out);
    fprintf(out, ")");
}

static void gen_call_stmt(Expr *e, FILE *out) {
    Function *decl = find_function_decl(e->name);
    if (!decl) {
        fprintf(stderr, "codegen error: call to unknown function '%s'\n", e->name);
        exit(1);
    }

    if (e->argCount != decl->paramCount) {
        fprintf(stderr, "codegen error: function '%s' expects %d arguments, but %d were provided\n",
                e->name, decl->paramCount, e->argCount);
        exit(1);
    }

    /* Передача аргументов в параметры функции */
    for (int i = 0; i < e->argCount; i++) {
        int paramReg = reg_for(e->name, decl->paramNames[i]);
        emit_write_var(paramReg, e->args[i], out);
    }

    char retLabel[NAME_BUF_SIZE];
    new_label(retLabel, "callret");
    int addrReg = addrreg_for(e->name);

    /* Запись адреса возврата: (W addrReg (gln retLabel)) */
    fprintf(out, "(W %d (gln %s))\n", addrReg, retLabel);
    fprintf(out, "(jump (gln %s))\n", e->name);
    emit_label(out, retLabel);
}

static void gen_expr(Expr *e, FILE *out) {
    if (!e) return;

    switch (e->kind) {
        case EXPR_NUM:
            fprintf(out, "%d", e->num);
            break;
        case EXPR_VAR: {
            int r = reg_for(g_curFunc, e->name);
            fprintf(out, "(R %d)", r);
            break;
        }
        case EXPR_ASSIGN: {
            /* Если RHS - вызов функции, выносим его перед записью */
            if (e->rhs && e->rhs->kind == EXPR_CALL) {
                gen_call_stmt(e->rhs, out);
                int retReg = retreg_for(e->rhs->name);
                int destReg = reg_for(g_curFunc, e->name);
                fprintf(out, "(W %d (R %d))\n", destReg, retReg);
                fprintf(out, "(clearstack)\n");
            } else {
                int r = reg_for(g_curFunc, e->name);
                emit_write_var(r, e->rhs, out);
            }
            break;
        }
        case EXPR_BINOP:
            gen_binop(e, out);
            break;
        case EXPR_UNOP:
            if (strcmp(e->op, "-") == 0) {
                fprintf(out, "(- 0 ");
                gen_expr(e->lhs, out);
                fprintf(out, ")");
            } else if (strcmp(e->op, "!") == 0) {
                fprintf(out, "(! ");
                gen_expr(e->lhs, out);
                fprintf(out, ")");
            }
            break;
        case EXPR_CALL:
            gen_call_stmt(e, out);
            {
                int retReg = retreg_for(e->name);
                fprintf(out, "(R %d)", retReg);
            }
            break;
    }
}

static void gen_stmt(Stmt *s, FILE *out);

static void gen_block(Stmt *s, FILE *out) {
    if (!s) return;
    for (int i = 0; i < s->stmtCount; i++) {
        gen_stmt(s->stmts[i], out);
    }
}

static void gen_stmt(Stmt *s, FILE *out) {
    if (!s) return;

    switch (s->kind) {
        case STMT_BLOCK:
            gen_block(s, out);
            break;
        case STMT_DECL: {
            int r = reg_for(g_curFunc, s->declName);
            /* Генерируем запись только если есть явная инициализация в самом объявлении */
            if (s->declInit != NULL) {
                emit_write_var(r, s->declInit, out);
            }
            break;
        }
        case STMT_EXPR:
            if (!s->expr) break;
            /* Избегаем вывода лишних чистых значений вроде (R 104) для стоящих отдельно выражений */
            if (s->expr->kind == EXPR_CALL) {
                gen_call_stmt(s->expr, out);
                fprintf(out, "(clearstack)\n");
            } else if (s->expr->kind == EXPR_ASSIGN) {
                gen_expr(s->expr, out);
            } else {
                /* Простые выражения без присваивания не должны создавать мусор в выводе */
            }
            break;
        case STMT_IF: {
            char elseLabel[NAME_BUF_SIZE], endLabel[NAME_BUF_SIZE];
            new_label(elseLabel, "else");
            new_label(endLabel, "endif");

            /* Порядок перехода: (? cond target) */
            fprintf(out, "(? (! ");
            gen_expr(s->expr, out);
            fprintf(out, ") (gln %s))\n", s->elseBranch ? elseLabel : endLabel);

            gen_stmt(s->thenBranch, out);
            fprintf(out, "(jump (gln %s))\n", endLabel);

            if (s->elseBranch) {
                emit_label(out, elseLabel);
                gen_stmt(s->elseBranch, out);
            }
            emit_label(out, endLabel);
            break;
        }
        case STMT_WHILE: {
            char startLabel[NAME_BUF_SIZE], endLabel[NAME_BUF_SIZE];
            new_label(startLabel, "wstart");
            new_label(endLabel, "wend");

            emit_label(out, startLabel);

            /* Порядок условного перехода: (? cond target) */
            fprintf(out, "(? (! ");
            gen_expr(s->expr, out);
            fprintf(out, ") (gln %s))\n", endLabel);

            gen_stmt(s->thenBranch, out);
            fprintf(out, "(clearstack)\n");
            fprintf(out, "(jump (gln %s))\n", startLabel);

            emit_label(out, endLabel);
            break;
        }
        case STMT_RETURN: {
            int retReg = retreg_for(g_curFunc);
            emit_write_var(retReg, s->expr, out);

            if (strcmp(g_curFunc, "main") == 0) {
                fprintf(out, "(jump (gln program_end))\n");
            } else {
                int addrReg = addrreg_for(g_curFunc);
                fprintf(out, "(jump (R %d))\n", addrReg);
            }
            break;
        }
    }
}

static int block_ends_with_return(Stmt *s) {
    if (!s) return 0;
    if (s->kind == STMT_BLOCK) {
        if (s->stmtCount > 0) {
            return block_ends_with_return(s->stmts[s->stmtCount - 1]);
        }
        return 0;
    }
    return s->kind == STMT_RETURN;
}

static void gen_function(Function *fn, FILE *out) {
    g_curFunc = fn->name;
    emit_label(out, fn->name);

    for (int i = 0; i < fn->paramCount; i++) {
        reg_for(fn->name, fn->paramNames[i]);
    }

    gen_block(fn->body, out);

    /* Генерируем jump только если функция не завершилась через explicit return */
    if (!block_ends_with_return(fn->body)) {
        if (strcmp(fn->name, "main") == 0) {
            fprintf(out, "(jump (gln program_end))\n");
        } else {
            int addrReg = addrreg_for(fn->name);
            fprintf(out, "(jump (R %d))\n", addrReg);
        }
    }
}

void codegen_program(Program *prog, FILE *out) {
    g_prog = prog;
    g_varCount = 0;
    g_funcCount = 0;
    g_nextReg = 100;
    g_labelCounter = 0;

    fprintf(out, "(jump (gln main))\n");

    for (int i = 0; i < prog->funcCount; i++) {
        gen_function(&prog->funcs[i], out);
    }

    emit_label(out, "program_end");

    /* Результат функции main хранится в её регистре возврата */
    int mainRetReg = retreg_for("main");
    fprintf(out, "(clog (R %d))\n", mainRetReg);
}