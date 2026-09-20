import type { Runtime } from '../../vm.js';

type Handler = (rt: Runtime) => void | Promise<void>;

export const stack: Map<string, Handler> = new Map([
    ['clearstack', (rt) => {
        rt.stack = [];
        rt.ip++;
    }],
    ['_', (rt) => {
        rt.stack.push('');
        rt.ip++;
    }],
    ['swap', (rt) => {
        if (rt.stack.length < 2) throw new Error('swap: stack underflow');
        const a = rt.stack.pop()!;
        const b = rt.stack.pop()!;
        rt.stack.push(a, b);
        rt.ip++;
    }],
    ['getstack', (rt) => {
        const n = Number(rt.stack.pop());
        if (Number.isNaN(n) || n < 0 || n >= rt.stack.length) throw new Error(`getstack: index ${n} out of range`);
        rt.stack.push(rt.stack[n]);
        rt.ip++;
    }],
    ['cstack', (rt) => {
        const n    = Number(rt.stack.pop());
        const data = rt.stack.pop() ?? '';
        if (Number.isNaN(n) || n < 0 || n >= rt.stack.length) throw new Error(`cstack: index ${n} out of range`);
        rt.stack[n] = data;
        rt.ip++;
    }],
]);
