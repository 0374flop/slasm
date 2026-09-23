import type { Runtime } from '../../vm.js';

type Handler = (rt: Runtime) => void | Promise<void>;

export const strings: Map<string, Handler> = new Map([
    ['JOIN', (rt) => {
        rt.stack.push(rt.stack.join(' '));
        rt.ip++;
    }],
    ['~', (rt) => {
        const b = rt.stack.pop() ?? '';
        const a = rt.stack.pop() ?? '';
        rt.stack.push(a + b);
        rt.ip++;
    }],
    ['rep', (rt) => {
        const text = rt.stack.pop() ?? '';
        const n = Math.trunc(Number(rt.stack.pop()) || 0);
        if (n <= 0 || text === '' || !Number.isFinite(n)) {
            rt.stack.push('');
        } else {
            rt.stack.push(text.repeat(n));
        }
        rt.ip++;
    }],
    ['char', (rt) => {
        const str = rt.stack.pop() ?? '';
        const rawN = rt.stack.pop();
        const n = Math.trunc(Number(rawN) || 0);
        if (n < 0 || n >= str.length || rawN === undefined) {
            rt.stack.push('');
        } else {
            rt.stack.push(str[n] ?? '');
        }
        rt.ip++;
    }],
    ['L', (rt) => {
        const upper = Number(rt.stack.pop());
        const id = Number(rt.stack.pop());
        const SRC = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const src = ' abcdefghijklmnopqrstuvwxyz';
        rt.stack.push((upper === 1 ? SRC[id] : src[id]) ?? '');
        rt.ip++;
    }],
    ['S', (rt) => {
        const n = Number(rt.stack.pop());
        rt.stack.push(' .,!?+-*/_…()'[n] ?? '');
        rt.ip++;
    }],
    ['S2', (rt) => {
        const n = Number(rt.stack.pop());
        let res = '';
        if (n === 0 || n === 1) res = ' ';
        else if (n === 2) res = '(';
        else if (n === 3) res = ')';
        else if (n === 4) res = ';';
        rt.stack.push(res);
        rt.ip++;
    }],
]);
