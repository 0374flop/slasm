import type { Runtime } from '../../vm.js';

type Handler = (rt: Runtime) => void;

const vm = (rt: Runtime) => rt.modules.get(rt.current)!;

function parseCell(rt: Runtime, raw: string): [Map<string, string>, string] {
    const dot = raw.indexOf('.');
    if (dot !== -1) {
        const ns  = raw.slice(0, dot);
        const key = raw.slice(dot + 1);
        const mod = rt.modules.get(ns);
        if (!mod) throw new Error(`W/R: module '${ns}' not loaded`);
        return [mod.memory, key];
    }
    return [vm(rt).memory, raw];
}

export const memory: Map<string, Handler> = new Map([
    ['W', (rt) => {
        const v   = vm(rt);
        const val = v.stack.pop() ?? '';
        const raw = v.stack.pop() ?? '';
        const [mem, key] = parseCell(rt, raw);
        mem.set(key, val);
        v.ip++;
    }],
    ['R', (rt) => {
        const v   = vm(rt);
        const raw = v.stack.pop() ?? '';
        const [mem, key] = parseCell(rt, raw);
        v.stack.push(mem.get(key) ?? '0');
        v.ip++;
    }],
]);
