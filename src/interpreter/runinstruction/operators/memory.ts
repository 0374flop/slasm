import type { Runtime } from '../../vm.js';

type Handler = (rt: Runtime) => void;

const vm = (rt: Runtime) => rt.modules.get(rt.current)!;

export const memory: Map<string, Handler> = new Map([
    ['W', (rt) => {
        const v = vm(rt);
        const val = v.stack.pop() ?? '';
        const n   = Number(v.stack.pop());
        v.memory.set(n, val);
        v.ip++;
    }],
    ['R', (rt) => {
        const v = vm(rt);
        const n = Number(v.stack.pop());
        v.stack.push(v.memory.get(n) ?? '0');
        v.ip++;
    }],
]);
