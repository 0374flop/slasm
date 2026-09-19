import type { Runtime } from '../../vm.js';

type Handler = (rt: Runtime) => void | Promise<void>;

export const control: Map<string, Handler> = new Map([
    ['gln', (rt) => {
        const name = rt.stack.pop();
        if (!name) throw new Error('gln: name is empty');
        const found = rt.labels.find(l => l.name === name);
        if (!found) throw new Error(`gln: label '${name}' not found`);
        rt.stack.push(String(found.ip));
        rt.ip++;
    }],
    ['jump', (rt) => {
        const target = Number(rt.stack.pop());
        if (target < 1 || target > rt.instructions.length) throw new Error(`jump: target ${target} out of range`);
        rt.ip = target - 1;
    }],
    ['?', (rt) => {
        const target = Number(rt.stack.pop());
        const cond   = rt.stack.pop();
        if (cond === 'true') {
            if (target < 1 || target > rt.instructions.length) throw new Error(`?: target ${target} out of range`);
            rt.ip = target - 1;
        } else {
            rt.ip++;
        }
    }],
    ['call', (rt) => {
        const target = Number(rt.stack.pop());
        if (target < 1 || target > rt.instructions.length) throw new Error(`call: target ${target} out of range`);
        rt.callstack.push({ ip: rt.ip + 1, returns: 0, stackBase: rt.stack.length });
        rt.ip = target - 1;
    }],
    ['ret', (rt) => {
        const frame = rt.callstack.pop();
        if (!frame) throw new Error('ret: callstack is empty');
        rt.ip = frame.ip;
    }],
    ['csnum', (rt) => {
        rt.stack.push(String(rt.callstack.length));
        rt.ip++;
    }],
]);
