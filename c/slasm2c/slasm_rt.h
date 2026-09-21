#ifndef SLASM_RT_H
#define SLASM_RT_H

#ifndef _POSIX_C_SOURCE
#define _POSIX_C_SOURCE 199309L
#endif

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <time.h>

#define STACK_MAX 4096
#define MEM_MAX 65536
#define ARENA_SIZE (64u * 1024u * 1024u)

typedef enum { T_NUM, T_STR } Tag;

typedef struct {
    Tag tag;
    double n;
    const char *s;
} Value;

typedef struct {
    Value st[STACK_MAX];
    int sp;
    Value mem[MEM_MAX];
} VM;

static char arena[ARENA_SIZE];
static size_t arena_top = 0;

static void die(const char *msg) {
    fprintf(stderr, "%s\n", msg);
    exit(1);
}

static void *arena_alloc(size_t size) {
    if (arena_top + size > ARENA_SIZE) die("arena exhausted");
    void *p = arena + arena_top;
    arena_top += size;
    return p;
}

static const char *arena_strdup(const char *s) {
    size_t len = strlen(s) + 1;
    char *p = arena_alloc(len);
    memcpy(p, s, len);
    return p;
}

static const char *fmt_num(double v) {
    char buf[64], out[64];
    if (isnan(v)) return "NaN";
    if (isinf(v)) return v < 0 ? "-Infinity" : "Infinity";
    if (v == 0) return "0";
    int prec;
    for (prec = 0; prec < 16; prec++) {
        snprintf(buf, sizeof buf, "%.*e", prec, v);
        if (strtod(buf, NULL) == v) break;
    }
    snprintf(buf, sizeof buf, "%.*e", prec, v);
    char *p = buf;
    int neg = 0;
    if (*p == '-') { neg = 1; p++; }
    char digits[32];
    int k = 0;
    for (; *p && *p != 'e'; p++) if (*p != '.') digits[k++] = *p;
    digits[k] = '\0';
    int n = atoi(p + 1) + 1;
    char *o = out;
    if (neg) *o++ = '-';
    if (k <= n && n <= 21) {
        memcpy(o, digits, k);
        o += k;
        for (int i = k; i < n; i++) *o++ = '0';
    } else if (0 < n && n <= 21) {
        memcpy(o, digits, n);
        o += n;
        *o++ = '.';
        memcpy(o, digits + n, k - n);
        o += k - n;
    } else if (-6 < n && n <= 0) {
        *o++ = '0';
        *o++ = '.';
        for (int i = 0; i < -n; i++) *o++ = '0';
        memcpy(o, digits, k);
        o += k;
    } else {
        *o++ = digits[0];
        if (k > 1) {
            *o++ = '.';
            memcpy(o, digits + 1, k - 1);
            o += k - 1;
        }
        o += sprintf(o, "e%c%d", n - 1 < 0 ? '-' : '+', abs(n - 1));
    }
    *o = '\0';
    return arena_strdup(out);
}

static Value num(double n) {
    Value v = { T_NUM, n, NULL };
    return v;
}

static Value str(const char *s) {
    Value v = { T_STR, 0, s };
    return v;
}

static int is_ws(char c) {
    return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\v' || c == '\f';
}

static double parse_radix(const char *s, int base) {
    if (*s == '\0') return NAN;
    double r = 0;
    for (; *s; s++) {
        int d;
        if (*s >= '0' && *s <= '9') d = *s - '0';
        else if (*s >= 'a' && *s <= 'z') d = *s - 'a' + 10;
        else if (*s >= 'A' && *s <= 'Z') d = *s - 'A' + 10;
        else return NAN;
        if (d >= base) return NAN;
        r = r * base + d;
    }
    return r;
}

static double str_to_num(const char *s) {
    while (is_ws(*s)) s++;
    const char *e = s + strlen(s);
    while (e > s && is_ws(e[-1])) e--;
    size_t len = (size_t)(e - s);
    if (len == 0) return 0;
    char buf[512];
    if (len >= sizeof buf) return NAN;
    memcpy(buf, s, len);
    buf[len] = '\0';
    if (buf[0] == '0' && len > 1) {
        char c = buf[1];
        if (c == 'x' || c == 'X') return parse_radix(buf + 2, 16);
        if (c == 'b' || c == 'B') return parse_radix(buf + 2, 2);
        if (c == 'o' || c == 'O') return parse_radix(buf + 2, 8);
    }
    const char *p = buf;
    int neg = 0;
    if (*p == '+' || *p == '-') { neg = *p == '-'; p++; }
    if (strcmp(p, "Infinity") == 0) return neg ? -INFINITY : INFINITY;
    const char *q = p;
    int digits = 0;
    while (*q >= '0' && *q <= '9') { q++; digits++; }
    if (*q == '.') {
        q++;
        while (*q >= '0' && *q <= '9') { q++; digits++; }
    }
    if (digits == 0) return NAN;
    if (*q == 'e' || *q == 'E') {
        q++;
        if (*q == '+' || *q == '-') q++;
        int ed = 0;
        while (*q >= '0' && *q <= '9') { q++; ed++; }
        if (ed == 0) return NAN;
    }
    if (*q != '\0') return NAN;
    return strtod(buf, NULL);
}

static double to_num(Value v) {
    return v.tag == T_NUM ? v.n : str_to_num(v.s);
}

static const char *to_str(Value v) {
    return v.tag == T_STR ? v.s : fmt_num(v.n);
}

static void push(VM *vm, Value v) {
    if (vm->sp >= STACK_MAX) die("stack overflow");
    vm->st[vm->sp++] = v;
}

static Value pop(VM *vm) {
    if (vm->sp <= 0) return str("");
    return vm->st[--vm->sp];
}

static void vm_init(VM *vm) {
    vm->sp = 0;
    for (int i = 0; i < MEM_MAX; i++) vm->mem[i] = num(0);
}

static long pop_target(VM *vm) {
    return (long)to_num(pop(vm));
}

static __attribute__((unused)) void op_push(VM *vm, const char *lit) {
    push(vm, str(lit));
}

static void op_add(VM *vm) {
    double b = to_num(pop(vm));
    double a = to_num(pop(vm));
    push(vm, num(a + b));
}

static void op_sub(VM *vm) {
    double b = to_num(pop(vm));
    double a = to_num(pop(vm));
    push(vm, num(a - b));
}

static void op_mul(VM *vm) {
    double b = to_num(pop(vm));
    double a = to_num(pop(vm));
    push(vm, num(a * b));
}

static void op_div(VM *vm) {
    double b = to_num(pop(vm));
    double a = to_num(pop(vm));
    push(vm, b == 0 ? str("Infinity") : num(a / b));
}

static void op_mod(VM *vm) {
    double b = to_num(pop(vm));
    double a = to_num(pop(vm));
    push(vm, b == 0 ? str("NaN") : num(fmod(a, b)));
}

static void op_eq(VM *vm) {
    Value b = pop(vm);
    Value a = pop(vm);
    push(vm, str(strcmp(to_str(a), to_str(b)) == 0 ? "true" : "false"));
}

static void op_lt(VM *vm) {
    double b = to_num(pop(vm));
    double a = to_num(pop(vm));
    push(vm, str(a < b ? "true" : "false"));
}

static void op_gt(VM *vm) {
    double b = to_num(pop(vm));
    double a = to_num(pop(vm));
    push(vm, str(a > b ? "true" : "false"));
}

static void op_not(VM *vm) {
    Value a = pop(vm);
    push(vm, str(strcmp(to_str(a), "true") != 0 ? "true" : "false"));
}

static long mem_index(Value k) {
    double d = to_num(k);
    if (isnan(d) || d < 0 || d >= MEM_MAX) die("memory address out of range");
    return (long)d;
}

static void op_W(VM *vm) {
    Value val = pop(vm);
    Value key = pop(vm);
    vm->mem[mem_index(key)] = val;
}

static void op_R(VM *vm) {
    Value key = pop(vm);
    push(vm, vm->mem[mem_index(key)]);
}

static void op_swap(VM *vm) {
    if (vm->sp < 2) die("swap: stack underflow");
    Value a = pop(vm);
    Value b = pop(vm);
    push(vm, a);
    push(vm, b);
}

static void op_clearstack(VM *vm) {
    vm->sp = 0;
}

static void op_under(VM *vm) {
    push(vm, str(""));
}

static void op_getstack(VM *vm) {
    long n = pop_target(vm);
    if (n < 0 || n >= vm->sp) die("getstack: index out of range");
    push(vm, vm->st[n]);
}

static void op_cstack(VM *vm) {
    long n = pop_target(vm);
    Value data = pop(vm);
    if (n < 0 || n >= vm->sp) die("cstack: index out of range");
    vm->st[n] = data;
}

static void op_clog(VM *vm) {
    puts(to_str(pop(vm)));
}

static void op_throw(VM *vm) {
    Value msg = pop(vm);
    die(to_str(msg));
}

#ifndef LABEL_STRUCT_DEFINED
#define LABEL_STRUCT_DEFINED
typedef struct {
    const char *name;
    long ip;
} Label;
#endif

static void op_gln(VM *vm, const Label *labels, int count) {
    const char *name = to_str(pop(vm));
    if (*name == '\0') die("gln: name is empty");
    for (int i = 0; i < count; i++) {
        if (strcmp(labels[i].name, name) == 0) {
            push(vm, num((double)labels[i].ip));
            return;
        }
    }
    fprintf(stderr, "gln: label '%s' not found\n", name);
    exit(1);
}

static void op_concat(VM *vm) {
    const char *b = to_str(pop(vm));
    const char *a = to_str(pop(vm));
    size_t la = strlen(a), lb = strlen(b);
    char *p = arena_alloc(la + lb + 1);
    memcpy(p, a, la);
    memcpy(p + la, b, lb + 1);
    push(vm, str(p));
}

static void op_join(VM *vm) {
    size_t total = 1;
    for (int i = 0; i < vm->sp; i++) total += strlen(to_str(vm->st[i])) + 1;
    char *p = arena_alloc(total);
    char *o = p;
    for (int i = 0; i < vm->sp; i++) {
        if (i) *o++ = ' ';
        const char *s = to_str(vm->st[i]);
        size_t l = strlen(s);
        memcpy(o, s, l);
        o += l;
    }
    *o = '\0';
    push(vm, str(p));
}

static void op_rep(VM *vm) {
    const char *text = to_str(pop(vm));
    double d = to_num(pop(vm));
    if (isnan(d)) d = 0;
    d = trunc(d);
    if (d < 0 || isinf(d)) {
        fprintf(stderr, "Invalid count value: %s\n", fmt_num(d));
        exit(1);
    }
    size_t l = strlen(text);
    if (l == 0 || d == 0) {
        push(vm, str(""));
        return;
    }
    if (d * (double)l >= (double)ARENA_SIZE) die("Invalid string length");
    size_t n = (size_t)d;
    char *p = arena_alloc(l * n + 1);
    for (size_t i = 0; i < n; i++) memcpy(p + i * l, text, l);
    p[l * n] = '\0';
    push(vm, str(p));
}

static void op_char(VM *vm) {
    double d = to_num(pop(vm));
    const char *s = to_str(pop(vm));
    if (d != trunc(d) || d < 0 || d >= (double)strlen(s)) {
        push(vm, str(""));
        return;
    }
    char *p = arena_alloc(2);
    p[0] = s[(size_t)d];
    p[1] = '\0';
    push(vm, str(p));
}

static void op_L(VM *vm) {
    double upper = to_num(pop(vm));
    double id = to_num(pop(vm));
    static const char UP[] = " ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    static const char LO[] = " abcdefghijklmnopqrstuvwxyz";
    if (id != trunc(id) || id < 0 || id >= 27) {
        push(vm, str(""));
        return;
    }
    char *p = arena_alloc(2);
    p[0] = (upper == 1 ? UP : LO)[(size_t)id];
    p[1] = '\0';
    push(vm, str(p));
}

static void op_S(VM *vm) {
    static const char *T[] = { " ", ".", ",", "!", "?", "+", "-", "*", "/", "_", "\xe2\x80\xa6", "(", ")" };
    double n = to_num(pop(vm));
    if (n != trunc(n) || n < 0 || n >= 13) {
        push(vm, str(""));
        return;
    }
    push(vm, str(T[(size_t)n]));
}

static void op_q(VM *vm) {
    char buf[4096];
    if (!fgets(buf, sizeof buf, stdin)) die("q: input queue exhausted");
    size_t n = strlen(buf);
    while (n && (buf[n - 1] == '\n' || buf[n - 1] == '\r')) buf[--n] = '\0';
    push(vm, str(arena_strdup(buf)));
}

static void op_rand(VM *vm) {
    static int seeded = 0;
    if (!seeded) {
        srand((unsigned)time(NULL));
        seeded = 1;
    }
    double max = to_num(pop(vm));
    double min = to_num(pop(vm));
    double r = (double)rand() / ((double)RAND_MAX + 1.0);
    push(vm, num(floor(r * (max - min + 1)) + min));
}

static void op_wait(VM *vm) {
    double ms = to_num(pop(vm));
    if (isnan(ms) || ms < 0) ms = 0;
    struct timespec ts;
    ts.tv_sec = (time_t)(ms / 1000);
    ts.tv_nsec = (long)(fmod(ms, 1000) * 1000000);
    nanosleep(&ts, NULL);
}

#endif
