import type { Runtime } from '../../vm.js';

type Handler = (rt: Runtime) => void;

const vm = (rt: Runtime) => rt.modules.get(rt.current)!;

export const introspect: Map<string, Handler> = new Map([
    ['i', (rt) => {
        const v = vm(rt);
        v.stack.push(String(v.ip + 1));
        v.ip++;
    }],
    ['inum', (rt) => {
        const v = vm(rt);
        v.stack.push(String(v.instructions.length));
        v.ip++;
    }],
    ['iget', (rt) => {
        const v = vm(rt);
        const n = Number(v.stack.pop());
        if (n < 1 || n > v.instructions.length) throw new Error(`iget: index ${n} out of range`);
        v.stack.push(v.instructions[n - 1]);
        v.ip++;
    }],
    ['SO', (rt) => {
        const v    = vm(rt);
        const cell = Number(v.stack.pop());
        const newOp = v.stack.pop() ?? '';
        if (cell < 1 || cell > v.instructions.length) throw new Error(`SO: cell ${cell} out of range`);
        v.instructions[cell - 1] = newOp;
        v.ip++;
    }],
]);
