import type { Runtime } from '../../vm.js';

type Handler = (rt: Runtime) => void;

const vm = (rt: Runtime) => rt.modules.get(rt.current)!;

export const control: Map<string, Handler> = new Map([
    ['gln', (rt) => {
        const v    = vm(rt);
        const name = v.stack.pop();
        if (!name) throw new Error('gln: name is empty');
        const lbl = v.labels.find(l => l.name === name);
        v.stack.push(String(lbl?.ip));
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
        rt.callstack.push(v.ip + 1);
        v.ip = target - 1;
    }],
    ['ret', (rt) => {
        if (rt.callstack.length === 0) throw new Error('ret: callstack is empty');
        vm(rt).ip = rt.callstack.pop()!;
    }],
    ['csnum', (rt) => {
        const v = vm(rt);
        v.stack.push(String(rt.callstack.length));
        v.ip++;
    }],
]);
