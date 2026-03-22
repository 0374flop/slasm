import type { Runtime } from '../../vm.js';

type Handler = (rt: Runtime) => void;

const vm = (rt: Runtime) => rt.modules.get(rt.current)!;

export const arithmetic: Map<string, Handler> = new Map([
    ['+', (rt) => {
        const v = vm(rt);
        const b = Number(v.stack.pop());
        const a = Number(v.stack.pop());
        v.stack.push(String(a + b));
        v.ip++;
    }],
    ['-', (rt) => {
        const v = vm(rt);
        const b = Number(v.stack.pop());
        const a = Number(v.stack.pop());
        v.stack.push(String(a - b));
        v.ip++;
    }],
    ['*', (rt) => {
        const v = vm(rt);
        const b = Number(v.stack.pop());
        const a = Number(v.stack.pop());
        v.stack.push(String(a * b));
        v.ip++;
    }],
    ['/', (rt) => {
        const v = vm(rt);
        const b = Number(v.stack.pop());
        const a = Number(v.stack.pop());
        if (b === 0) throw new Error('Division by zero');
        v.stack.push(String(a / b));
        v.ip++;
    }],
    ['%', (rt) => {
        const v = vm(rt);
        const b = Number(v.stack.pop());
        const a = Number(v.stack.pop());
        if (b === 0) throw new Error('Division by zero');
        v.stack.push(String(a % b));
        v.ip++;
    }],
    ['=', (rt) => {
        const v = vm(rt);
        const b = v.stack.pop();
        const a = v.stack.pop();
        v.stack.push(String(a === b));
        v.ip++;
    }],
    ['<', (rt) => {
        const v = vm(rt);
        const b = Number(v.stack.pop());
        const a = Number(v.stack.pop());
        v.stack.push(String(a < b));
        v.ip++;
    }],
    ['>', (rt) => {
        const v = vm(rt);
        const b = Number(v.stack.pop());
        const a = Number(v.stack.pop());
        v.stack.push(String(a > b));
        v.ip++;
    }],
    ['!', (rt) => {
        const v = vm(rt);
        v.stack.push(String(v.stack.pop() !== 'true'));
        v.ip++;
    }],
]);
