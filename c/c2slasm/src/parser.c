#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "parser.h"

static void advance(Parser *p) {
    p->cur = lexer_next(&p->lx);
}

static void expect(Parser *p, TokenType t, const char *what) {
    if (p->cur.type != t) {
        fprintf(stderr, "parse error line %d: expected %s, got token type %d ('%s')\n",
                p->cur.line, what, p->cur.type, p->cur.text);
        exit(1);
    }
    advance(p);
}

void parser_init(Parser *p, const char *src) {
    lexer_init(&p->lx, src);
    advance(p);
}

static Expr *parse_expr(Parser *p);

static Expr *parse_primary(Parser *p) {
    if (p->cur.type == TOK_NUM) {
        Expr *e = expr_new(EXPR_NUM);
        e->num = atoi(p->cur.text);
        advance(p);
        return e;
    }
    if (p->cur.type == TOK_IDENT) {
        char name[128];
        strcpy(name, p->cur.text);
        advance(p);
        if (p->cur.type == TOK_LPAREN) {
            advance(p);
            Expr *e = expr_new(EXPR_CALL);
            strcpy(e->name, name);
            Expr *args[16];
            int count = 0;
            if (p->cur.type != TOK_RPAREN) {
                args[count++] = parse_expr(p);
                while (p->cur.type == TOK_COMMA) {
                    advance(p);
                    args[count++] = parse_expr(p);
                }
            }
            expect(p, TOK_RPAREN, ")");
            e->args = (Expr **)malloc(sizeof(Expr *) * count);
            memcpy(e->args, args, sizeof(Expr *) * count);
            e->argCount = count;
            return e;
        }
        Expr *e = expr_new(EXPR_VAR);
        strcpy(e->name, name);
        return e;
    }
    if (p->cur.type == TOK_LPAREN) {
        advance(p);
        Expr *e = parse_expr(p);
        expect(p, TOK_RPAREN, ")");
        return e;
    }
    if (p->cur.type == TOK_MINUS) {
        advance(p);
        Expr *e = expr_new(EXPR_UNOP);
        strcpy(e->op, "-");
        e->lhs = parse_primary(p);
        return e;
    }
    if (p->cur.type == TOK_NOT) {
        advance(p);
        Expr *e = expr_new(EXPR_UNOP);
        strcpy(e->op, "!");
        e->lhs = parse_primary(p);
        return e;
    }
    fprintf(stderr, "parse error line %d: unexpected token in expression\n", p->cur.line);
    exit(1);
}

static Expr *parse_term(Parser *p) {
    Expr *lhs = parse_primary(p);
    while (p->cur.type == TOK_STAR || p->cur.type == TOK_SLASH || p->cur.type == TOK_PERCENT) {
        char op[3];
        if (p->cur.type == TOK_STAR) strcpy(op, "*");
        else if (p->cur.type == TOK_SLASH) strcpy(op, "/");
        else strcpy(op, "%");
        advance(p);
        Expr *rhs = parse_primary(p);
        Expr *e = expr_new(EXPR_BINOP);
        strcpy(e->op, op);
        e->lhs = lhs;
        e->rhs = rhs;
        lhs = e;
    }
    return lhs;
}

static Expr *parse_additive(Parser *p) {
    Expr *lhs = parse_term(p);
    while (p->cur.type == TOK_PLUS || p->cur.type == TOK_MINUS) {
        char op[3];
        strcpy(op, p->cur.type == TOK_PLUS ? "+" : "-");
        advance(p);
        Expr *rhs = parse_term(p);
        Expr *e = expr_new(EXPR_BINOP);
        strcpy(e->op, op);
        e->lhs = lhs;
        e->rhs = rhs;
        lhs = e;
    }
    return lhs;
}

static Expr *parse_relational(Parser *p) {
    Expr *lhs = parse_additive(p);
    while (p->cur.type == TOK_LT || p->cur.type == TOK_GT ||
           p->cur.type == TOK_EQ || p->cur.type == TOK_NEQ) {
        char op[3];
        if (p->cur.type == TOK_LT) strcpy(op, "<");
        else if (p->cur.type == TOK_GT) strcpy(op, ">");
        else if (p->cur.type == TOK_EQ) strcpy(op, "==");
        else strcpy(op, "!=");
        advance(p);
        Expr *rhs = parse_additive(p);
        Expr *e = expr_new(EXPR_BINOP);
        strcpy(e->op, op);
        e->lhs = lhs;
        e->rhs = rhs;
        lhs = e;
    }
    return lhs;
}

static Expr *parse_logical(Parser *p) {
    Expr *lhs = parse_relational(p);
    while (p->cur.type == TOK_AND || p->cur.type == TOK_OR) {
        char op[3];
        strcpy(op, p->cur.type == TOK_AND ? "&&" : "||");
        advance(p);
        Expr *rhs = parse_relational(p);
        Expr *e = expr_new(EXPR_BINOP);
        strcpy(e->op, op);
        e->lhs = lhs;
        e->rhs = rhs;
        lhs = e;
    }
    return lhs;
}

static Expr *parse_expr(Parser *p) {
    if (p->cur.type == TOK_IDENT) {
        Lexer savedLx = p->lx;
        Token savedTok = p->cur;
        char name[128];
        strcpy(name, p->cur.text);
        advance(p);
        if (p->cur.type == TOK_ASSIGN) {
            advance(p);
            Expr *rhs = parse_expr(p);
            Expr *e = expr_new(EXPR_ASSIGN);
            strcpy(e->name, name);
            e->rhs = rhs;
            return e;
        }
        p->lx = savedLx;
        p->cur = savedTok;
    }
    return parse_logical(p);
}

static Stmt *parse_stmt(Parser *p);

static Stmt *parse_block(Parser *p) {
    expect(p, TOK_LBRACE, "{");
    Stmt *block = stmt_new(STMT_BLOCK);
    Stmt *stmts[256];
    int count = 0;
    while (p->cur.type != TOK_RBRACE) {
        stmts[count++] = parse_stmt(p);
    }
    expect(p, TOK_RBRACE, "}");
    block->stmts = (Stmt **)malloc(sizeof(Stmt *) * count);
    memcpy(block->stmts, stmts, sizeof(Stmt *) * count);
    block->stmtCount = count;
    return block;
}

static Stmt *parse_stmt(Parser *p) {
    if (p->cur.type == TOK_LBRACE) {
        return parse_block(p);
    }
    if (p->cur.type == TOK_INT) {
        advance(p);
        Stmt *s = stmt_new(STMT_DECL);
        strcpy(s->declName, p->cur.text);
        expect(p, TOK_IDENT, "identifier");
        if (p->cur.type == TOK_ASSIGN) {
            advance(p);
            s->declInit = parse_expr(p);
        }
        expect(p, TOK_SEMI, ";");
        return s;
    }
    if (p->cur.type == TOK_IF) {
        advance(p);
        expect(p, TOK_LPAREN, "(");
        Stmt *s = stmt_new(STMT_IF);
        s->expr = parse_expr(p);
        expect(p, TOK_RPAREN, ")");
        s->thenBranch = parse_stmt(p);
        if (p->cur.type == TOK_ELSE) {
            advance(p);
            s->elseBranch = parse_stmt(p);
        }
        return s;
    }
    if (p->cur.type == TOK_WHILE) {
        advance(p);
        expect(p, TOK_LPAREN, "(");
        Stmt *s = stmt_new(STMT_WHILE);
        s->expr = parse_expr(p);
        expect(p, TOK_RPAREN, ")");
        s->thenBranch = parse_stmt(p);
        return s;
    }
    if (p->cur.type == TOK_RETURN) {
        advance(p);
        Stmt *s = stmt_new(STMT_RETURN);
        if (p->cur.type != TOK_SEMI) {
            s->expr = parse_expr(p);
        }
        expect(p, TOK_SEMI, ";");
        return s;
    }
    Stmt *s = stmt_new(STMT_EXPR);
    s->expr = parse_expr(p);
    expect(p, TOK_SEMI, ";");
    return s;
}

static Function parse_function(Parser *p) {
    Function fn;
    memset(&fn, 0, sizeof(fn));

    if (p->cur.type == TOK_INT || p->cur.type == TOK_VOID) {
        advance(p);
    } else {
        fprintf(stderr, "parse error line %d: expected return type\n", p->cur.line);
        exit(1);
    }

    strcpy(fn.name, p->cur.text);
    expect(p, TOK_IDENT, "function name");
    expect(p, TOK_LPAREN, "(");

    if (p->cur.type != TOK_RPAREN) {
        for (;;) {
            if (p->cur.type == TOK_INT) advance(p);
            strcpy(fn.paramNames[fn.paramCount], p->cur.text);
            fn.paramCount++;
            expect(p, TOK_IDENT, "parameter name");
            if (p->cur.type == TOK_COMMA) { advance(p); continue; }
            break;
        }
    }
    expect(p, TOK_RPAREN, ")");
    fn.body = parse_block(p);
    return fn;
}

Program *parser_parse_program(Parser *p) {
    Program *prog = (Program *)calloc(1, sizeof(Program));
    while (p->cur.type != TOK_EOF) {
        prog->funcs[prog->funcCount++] = parse_function(p);
    }
    return prog;
}
