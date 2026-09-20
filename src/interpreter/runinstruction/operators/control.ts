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
        if (Number.isNaN(target) || target < 1 || target > rt.instructions.length + 1) throw new Error(`jump: target ${target} out of range`);
        rt.ip = target - 1;
    }],
    ['?', (rt) => {
        const target = Number(rt.stack.pop());
        const cond   = rt.stack.pop();
        if (cond === 'true') {
            if (Number.isNaN(target) || target < 1 || target > rt.instructions.length + 1) throw new Error(`?: target ${target} out of range`);
            rt.ip = target - 1;
        } else {
            rt.ip++;
        }
    }],
]);
