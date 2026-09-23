import type { Runtime } from '../../vm.js';

type Handler = (rt: Runtime) => void | Promise<void>;

function checkStack(rt: Runtime, count: number, op: string): void {
    if (rt.stack.length < count) throw new Error(`${op}: stack underflow`);
}

function parseNum(val: string | undefined): number {
    if (val === undefined || val === '') return 0;
    const n = Number(val);
    return Number.isNaN(n) ? 0 : n;
}

export const arithmetic: Map<string, Handler> = new Map([
    ['+', (rt) => {
        checkStack(rt, 2, '+');
        const b = parseNum(rt.stack.pop());
        const a = parseNum(rt.stack.pop());
        rt.stack.push(String(a + b));
        rt.ip++;
    }],
    ['-', (rt) => {
        checkStack(rt, 2, '-');
        const b = parseNum(rt.stack.pop());
        const a = parseNum(rt.stack.pop());
        rt.stack.push(String(a - b));
        rt.ip++;
    }],
    ['*', (rt) => {
        checkStack(rt, 2, '*');
        const b = parseNum(rt.stack.pop());
        const a = parseNum(rt.stack.pop());
        rt.stack.push(String(a * b));
        rt.ip++;
    }],
    ['/', (rt) => {
        checkStack(rt, 2, '/');
        const b = parseNum(rt.stack.pop());
        const a = parseNum(rt.stack.pop());
        if (b === 0) {
            rt.stack.push('Infinity');
        } else {
            rt.stack.push(String(a / b));
        }
        rt.ip++;
    }],
    ['%', (rt) => {
        checkStack(rt, 2, '%');
        const b = parseNum(rt.stack.pop());
        const a = parseNum(rt.stack.pop());
        if (b === 0) {
            rt.stack.push('NaN');
        } else {
            rt.stack.push(String(a % b));
        }
        rt.ip++;
    }],
    ['=', (rt) => {
        checkStack(rt, 2, '=');
        const b = rt.stack.pop();
        const a = rt.stack.pop();
        rt.stack.push(String(a === b));
        rt.ip++;
    }],
    ['<', (rt) => {
        checkStack(rt, 2, '<');
        const b = parseNum(rt.stack.pop());
        const a = parseNum(rt.stack.pop());
        rt.stack.push(String(a < b));
        rt.ip++;
    }],
    ['>', (rt) => {
        checkStack(rt, 2, '>');
        const b = parseNum(rt.stack.pop());
        const a = parseNum(rt.stack.pop());
        rt.stack.push(String(a > b));
        rt.ip++;
    }],
    ['!', (rt) => {
        checkStack(rt, 1, '!');
        rt.stack.push(String(rt.stack.pop() !== 'true'));
        rt.ip++;
    }],
    ['&', (rt) => {
        checkStack(rt, 2, '&');
        const b = rt.stack.pop();
        const a = rt.stack.pop();
        rt.stack.push(String(a === 'true' && b === 'true'));
        rt.ip++;
    }],
    ['\\', (rt) => {
        checkStack(rt, 2, '\\');
        const b = rt.stack.pop();
        const a = rt.stack.pop();
        rt.stack.push(String(a === 'true' || b === 'true'));
        rt.ip++;
    }],
]);
