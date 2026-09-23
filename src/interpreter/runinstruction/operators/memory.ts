import type { Runtime } from '../../vm.js';

type Handler = (rt: Runtime) => void | Promise<void>;

export const memory: Map<string, Handler> = new Map([
    ['W', (rt) => {
        const val = rt.stack.pop() ?? '';
        const rawKey = rt.stack.pop();
        const key = Math.trunc(Number(rawKey) || 0);
        if (key >= 1 && key <= 19999) {
            rt.memory.set(key, val);
        }
        rt.ip++;
    }],
    ['R', (rt) => {
        const rawKey = rt.stack.pop();
        const key = Math.trunc(Number(rawKey) || 0);
        if (key >= 1 && key <= 19999) {
            rt.stack.push(rt.memory.get(key) ?? '0');
        } else {
            rt.stack.push('0');
        }
        rt.ip++;
    }],
]);
