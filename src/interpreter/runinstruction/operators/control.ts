import type { Runtime } from '../../vm.js';

type Handler = (rt: Runtime) => void;

const vm = (rt: Runtime) => rt.modules.get(rt.current)!;

export const control: Map<string, Handler> = new Map([
    ['gln', (rt) => {
        const v    = vm(rt);
        const name = v.stack.pop();
        if (!name) throw new Error('gln: name is empty');

        const dot = name.indexOf('.');
        if (dot !== -1) {
            const ns  = name.slice(0, dot);
            const lbl = name.slice(dot + 1);
            const mod = rt.modules.get(ns);
            if (!mod) throw new Error(`gln: module '${ns}' not loaded`);
            const found = mod.labels.find(l => l.name === lbl);
            if (!found) throw new Error(`gln: label '${lbl}' not found in module '${ns}'`);
            v.stack.push(String(found.ip));
        } else {
            const found = v.labels.find(l => l.name === name);
            if (!found) throw new Error(`gln: label '${name}' not found`);
            v.stack.push(String(found.ip));
        }
        v.ip++;
    }],
    ['jump', (rt) => {
        const v      = vm(rt);
        const target = Number(v.stack.pop());
        if (target < 1 || target > v.instructions.length) throw new Error(`jump: target ${target} out of range`);
        v.ip = target - 1;
    }],
    ['?', (rt) => {
        const v      = vm(rt);
        const target = Number(v.stack.pop());
        const cond   = v.stack.pop();
        if (cond === 'true') {
            if (target < 1 || target > v.instructions.length) throw new Error(`?: target ${target} out of range`);
            v.ip = target - 1;
        } else {
            v.ip++;
        }
    }],
    ['call', (rt) => {
        const v      = vm(rt);
        const target = Number(v.stack.pop());
        if (target < 1 || target > v.instructions.length) throw new Error(`call: target ${target} out of range`);

        const exp     = v.exports.find(e => e.ip === target);
        const args    = exp?.args    ?? 0;
        const returns = exp?.returns ?? 0;

        const argVals: string[] = [];
        for (let i = 0; i < args; i++) {
            const val = v.stack.pop();
            if (val === undefined) throw new Error(`call: not enough arguments (need ${args})`);
            argVals.unshift(val);
        }

        const stackBase = v.stack.length;
        rt.callstack.push({ namespace: rt.current, ip: v.ip + 1, returns, stackBase });
        v.ip = target - 1;
        for (const val of argVals) v.stack.push(val);
    }],
    ['callns', (rt) => {
        const v   = vm(rt);
        const ns  = v.stack.pop() ?? '';
        const lbl = v.stack.pop() ?? '';
        const mod = rt.modules.get(ns);
        if (!mod) throw new Error(`callns: module '${ns}' not loaded`);
        const found = mod.labels.find(l => l.name === lbl);
        if (!found) throw new Error(`callns: label '${lbl}' not found in '${ns}'`);

        const exp     = mod.exports.find(e => e.name === lbl);
        const args    = exp?.args    ?? 0;
        const returns = exp?.returns ?? 0;

        const argVals: string[] = [];
        for (let i = 0; i < args; i++) {
            const val = v.stack.pop();
            if (val === undefined) throw new Error(`callns: not enough arguments (need ${args})`);
            argVals.unshift(val);
        }

        const stackBase = mod.stack.length;
        rt.callstack.push({ namespace: rt.current, ip: v.ip + 1, returns, stackBase });
        rt.current = ns;
        mod.ip = found.ip - 1;
        for (const val of argVals) mod.stack.push(val);
    }],
    ['ret', (rt) => {
        if (rt.callstack.length === 0) throw new Error('ret: callstack is empty');
        const frame   = rt.callstack.pop()!;
        const currMod = rt.modules.get(rt.current)!;

        const retVals: string[] = [];
        for (let i = 0; i < frame.returns; i++) {
            const val = currMod.stack.pop();
            if (val === undefined) throw new Error(`ret: not enough return values (need ${frame.returns})`);
            retVals.unshift(val);
        }

        currMod.stack.length = frame.stackBase;

        rt.current = frame.namespace;
        const callerVM = rt.modules.get(rt.current)!;
        callerVM.ip = frame.ip;
        for (const val of retVals) callerVM.stack.push(val);
    }],
    ['csnum', (rt) => {
        const v = vm(rt);
        v.stack.push(String(rt.callstack.length));
        v.ip++;
    }],
]);
