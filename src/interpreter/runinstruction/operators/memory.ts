import type { Runtime } from '../../vm.js';

type Handler = (rt: Runtime) => void | Promise<void>;

export const memory: Map<string, Handler> = new Map([
    ['W', (rt) => {
        const val = rt.stack.pop() ?? '';
        const key = Number(rt.stack.pop() ?? '0');
        rt.memory.set(key, val);
        rt.ip++;
    }],
    ['R', (rt) => {
        const key = Number(rt.stack.pop() ?? '0');
        rt.stack.push(rt.memory.get(key) ?? '0');
        rt.ip++;
    }],
]);
