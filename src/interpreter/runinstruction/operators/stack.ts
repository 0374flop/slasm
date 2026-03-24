import type { Runtime } from '../../vm.js';

type Handler = (rt: Runtime) => void;

const vm = (rt: Runtime) => rt.modules.get(rt.current)!;

export const stack: Map<string, Handler> = new Map([
    ['clearstack', (rt) => {
        vm(rt).stack = [];
        vm(rt).ip++;
    }],
    ['_', (rt) => {
        const v = vm(rt);
        v.stack.push('');
        v.ip++;
    }],
    ['swap', (rt) => {
        const v = vm(rt);
        if (v.stack.length < 2) throw new Error('swap: stack underflow');
        const a = v.stack.pop()!;
        const b = v.stack.pop()!;
        v.stack.push(a, b);
        v.ip++;
    }],
    ['getstack', (rt) => {
        const v = vm(rt);
        const n = Number(v.stack.pop());
        if (n < 0 || n >= v.stack.length) throw new Error(`getstack: index ${n} out of range`);
        v.stack.push(v.stack[n]);
        v.ip++;
    }],
    ['cstack', (rt) => {
        const v = vm(rt);
        const n    = Number(v.stack.pop());
        const data = v.stack.pop() ?? '';
        if (n < 0 || n >= v.stack.length) throw new Error(`cstack: index ${n} out of range`);
        v.stack[n] = data;
        v.ip++;
    }],
]);
