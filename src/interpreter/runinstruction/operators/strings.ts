import type { Runtime } from '../../vm.js';

type Handler = (rt: Runtime) => void;

const vm = (rt: Runtime) => rt.modules.get(rt.current)!;

export const strings: Map<string, Handler> = new Map([
    ['JOIN', (rt) => {
        const v = vm(rt);
        v.stack.push(v.stack.join(' '));
        v.ip++;
    }],
    ['~', (rt) => {
        const v = vm(rt);
        const b = v.stack.pop() ?? '';
        const a = v.stack.pop() ?? '';
        v.stack.push(a + b);
        v.ip++;
    }],
    ['rep', (rt) => {
        const v = vm(rt);
        const text = v.stack.pop() ?? '';
        const n    = Number(v.stack.pop());
        v.stack.push(text.repeat(n));
        v.ip++;
    }],
    ['char', (rt) => {
        const v = vm(rt);
        const n   = Number(v.stack.pop());
        const str = v.stack.pop() ?? '';
        v.stack.push(str[n] ?? '');
        v.ip++;
    }],
    ['L', (rt) => {
        const v     = vm(rt);
        const upper = Number(v.stack.pop());
        const id    = Number(v.stack.pop());
        const SRC   = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const src   = ' abcdefghijklmnopqrstuvwxyz';
        v.stack.push(upper === 1 ? SRC[id] : src[id]);
        v.ip++;
    }],
    ['S', (rt) => {
        const v = vm(rt);
        const n = Number(v.stack.pop());
        v.stack.push(' .,();-'[n] ?? '');
        v.ip++;
    }],
]);
