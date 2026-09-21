#include "vm.h"
#include "../../slasm2c/slasm_rt.h"

void vm_run(const Program *prog) {
    VM vm;
    vm_init(&vm);

    int ip = 0; /* 0-based index into prog->instructions array */

    while (ip < prog->icount) {
        const char *op = prog->instructions[ip];

        if (strcmp(op, "push") == 0) {
            ip++;
            if (ip >= prog->icount) die("Missing value after push");
            push(&vm, str(prog->instructions[ip]));
            ip++;
            continue;
        }

        if (strcmp(op, "+") == 0) { op_add(&vm); ip++; continue; }
        if (strcmp(op, "-") == 0) { op_sub(&vm); ip++; continue; }
        if (strcmp(op, "*") == 0) { op_mul(&vm); ip++; continue; }
        if (strcmp(op, "/") == 0) { op_div(&vm); ip++; continue; }
        if (strcmp(op, "%") == 0) { op_mod(&vm); ip++; continue; }
        if (strcmp(op, "=") == 0) { op_eq(&vm); ip++; continue; }
        if (strcmp(op, "<") == 0) { op_lt(&vm); ip++; continue; }
        if (strcmp(op, ">") == 0) { op_gt(&vm); ip++; continue; }
        if (strcmp(op, "!") == 0) { op_not(&vm); ip++; continue; }
        if (strcmp(op, "W") == 0) { op_W(&vm); ip++; continue; }
        if (strcmp(op, "R") == 0) { op_R(&vm); ip++; continue; }
        if (strcmp(op, "~") == 0) { op_concat(&vm); ip++; continue; }
        if (strcmp(op, "JOIN") == 0) { op_join(&vm); ip++; continue; }
        if (strcmp(op, "rep") == 0) { op_rep(&vm); ip++; continue; }
        if (strcmp(op, "char") == 0) { op_char(&vm); ip++; continue; }
        if (strcmp(op, "L") == 0) { op_L(&vm); ip++; continue; }
        if (strcmp(op, "S") == 0) { op_S(&vm); ip++; continue; }
        if (strcmp(op, "gln") == 0) {
            /* Map prog->labels into slasm_rt format */
            Label *slasm_labels = (Label *)prog->labels;
            op_gln(&vm, slasm_labels, prog->lcount);
            ip++;
            continue;
        }
        if (strcmp(op, "jump") == 0) {
            long target = pop_target(&vm);
            if (target < 1 || target > prog->icount + 1) {
                fprintf(stderr, "jump: target %ld out of range\n", target);
                exit(1);
            }
            ip = (int)target - 1;
            continue;
        }
        if (strcmp(op, "?") == 0) {
            long target = pop_target(&vm);
            Value cond = pop(&vm);
            if (strcmp(to_str(cond), "true") == 0) {
                if (target < 1 || target > prog->icount + 1) {
                    fprintf(stderr, "?: target %ld out of range\n", target);
                    exit(1);
                }
                ip = (int)target - 1;
            } else {
                ip++;
            }
            continue;
        }
        if (strcmp(op, "clearstack") == 0) { op_clearstack(&vm); ip++; continue; }
        if (strcmp(op, "swap") == 0) { op_swap(&vm); ip++; continue; }
        if (strcmp(op, "_") == 0) { op_under(&vm); ip++; continue; }
        if (strcmp(op, "getstack") == 0) { op_getstack(&vm); ip++; continue; }
        if (strcmp(op, "cstack") == 0) { op_cstack(&vm); ip++; continue; }
        if (strcmp(op, "?*") == 0) { op_rand(&vm); ip++; continue; }
        if (strcmp(op, "wait") == 0) { op_wait(&vm); ip++; continue; }
        if (strcmp(op, "throw") == 0) { op_throw(&vm); ip++; continue; }
        if (strcmp(op, "clog") == 0) { op_clog(&vm); ip++; continue; }
        if (strcmp(op, "q") == 0) { op_q(&vm); ip++; continue; }
        if (strcmp(op, "begin") == 0 || strcmp(op, "none") == 0) { ip++; continue; }

        fprintf(stderr, "Undefined operator '%s'\n", op);
        exit(1);
    }
}
