import type { Runtime } from '../../vm.js';

type Handler = (rt: Runtime) => void | Promise<void>;

export const arithmetic: Map<string, Handler> = new Map([
    ['+', (rt) => {
        const b = Number(rt.stack.pop());
        const a = Number(rt.stack.pop());
        rt.stack.push(String(a + b));
        rt.ip++;
    }],
    ['-', (rt) => {
        const b = Number(rt.stack.pop());
        const a = Number(rt.stack.pop());
        rt.stack.push(String(a - b));
        rt.ip++;
    }],
    ['*', (rt) => {
        const b = Number(rt.stack.pop());
        const a = Number(rt.stack.pop());
        rt.stack.push(String(a * b));
        rt.ip++;
    }],
    ['/', (rt) => {
        const b = Number(rt.stack.pop());
        const a = Number(rt.stack.pop());
        if (b === 0) throw new Error('Division by zero');
        rt.stack.push(String(a / b));
        rt.ip++;
    }],
    ['%', (rt) => {
        const b = Number(rt.stack.pop());
        const a = Number(rt.stack.pop());
        if (b === 0) throw new Error('Division by zero');
        rt.stack.push(String(a % b));
        rt.ip++;
    }],
    ['=', (rt) => {
        const b = rt.stack.pop();
        const a = rt.stack.pop();
        rt.stack.push(String(a === b));
        rt.ip++;
    }],
    ['<', (rt) => {
        const b = Number(rt.stack.pop());
        const a = Number(rt.stack.pop());
        rt.stack.push(String(a < b));
        rt.ip++;
    }],
    ['>', (rt) => {
        const b = Number(rt.stack.pop());
        const a = Number(rt.stack.pop());
        rt.stack.push(String(a > b));
        rt.ip++;
    }],
    ['!', (rt) => {
        rt.stack.push(String(rt.stack.pop() !== 'true'));
        rt.ip++;
    }],
]);
