import type { Runtime } from '../../vm.js';

type Handler = (rt: Runtime) => void;

const vm = (rt: Runtime) => rt.modules.get(rt.current)!;

function parseCell(rt: Runtime, raw: string): [Map<number, string>, number] {
    const dot = raw.indexOf('.');
    if (dot !== -1) {
        const ns  = raw.slice(0, dot);
        const n   = Number(raw.slice(dot + 1));
        const mod = rt.modules.get(ns);
        if (!mod) throw new Error(`W/R: module '${ns}' not loaded`);
        return [mod.memory, n];
    }
    return [vm(rt).memory, Number(raw)];
}

export const memory: Map<string, Handler> = new Map([
    ['W', (rt) => {
        const v   = vm(rt);
        const val = v.stack.pop() ?? '';
        const raw = v.stack.pop() ?? '';
        const [mem, n] = parseCell(rt, raw);
        mem.set(n, val);
        v.ip++;
    }],
    ['R', (rt) => {
        const v   = vm(rt);
        const raw = v.stack.pop() ?? '';
        const [mem, n] = parseCell(rt, raw);
        v.stack.push(mem.get(n) ?? '0');
        v.ip++;
    }],
]);
