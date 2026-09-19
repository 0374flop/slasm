import type { Runtime } from '../../vm.js';

type Handler = (rt: Runtime) => void | Promise<void>;

export const memory: Map<string, Handler> = new Map([
    ['W', (rt) => {
        const val = rt.stack.pop() ?? '';
        const key = rt.stack.pop() ?? '';
        rt.memory.set(key, val);
        rt.ip++;
    }],
    ['R', (rt) => {
        const key = rt.stack.pop() ?? '';
        rt.stack.push(rt.memory.get(key) ?? '0');
        rt.ip++;
    }],
]);
