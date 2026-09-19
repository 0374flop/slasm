import type { Runtime } from '../../vm.js';

type Handler = (rt: Runtime) => void | Promise<void>;

export const misc: Map<string, Handler> = new Map([
    ['?*', (rt) => {
        const max = Number(rt.stack.pop());
        const min = Number(rt.stack.pop());
        rt.stack.push(String(Math.floor(Math.random() * (max - min + 1)) + min));
        rt.ip++;
    }],
    ['wait', async (rt) => {
        const ms = Number(rt.stack.pop());
        await new Promise<void>(r => setTimeout(r, ms));
        rt.ip++;
    }],
    ['throw', (rt) => {
        const msg = rt.stack.pop() ?? 'unknown';
        throw new Error(msg);
    }],
    ['begin', (rt) => { rt.ip++; }],
    ['none',  (rt) => { rt.ip++; }],
    ['done',  (rt) => { rt.killed = true; }],
]);
