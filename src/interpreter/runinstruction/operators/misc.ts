import type { Runtime } from '../../vm.js';

type Handler = (rt: Runtime) => void;

const vm = (rt: Runtime) => rt.modules.get(rt.current)!;

export const misc: Map<string, Handler> = new Map([
    ['?*', (rt) => {
        const v   = vm(rt);
        const max = Number(v.stack.pop());
        const min = Number(v.stack.pop());
        v.stack.push(String(Math.floor(Math.random() * (max - min + 1)) + min));
        v.ip++;
    }],
    ['wait', (rt) => {
        const v  = vm(rt);
        const ms = Number(v.stack.pop());
        const end = Date.now() + ms;
        while (Date.now() < end) {}
        v.ip++;
    }],
    ['throw', (rt) => {
        const msg = vm(rt).stack.pop() ?? 'unknown';
        throw new Error(msg);
    }],
    ['begin', (rt) => { vm(rt).ip++; }],
    ['none',  (rt) => { vm(rt).ip++; }],
]);
