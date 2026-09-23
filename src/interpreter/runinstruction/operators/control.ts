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
        let target = Math.trunc(Number(rt.stack.pop()) || 0);
        if (target <= 1) {
            rt.ip = 0;
        } else if (target > rt.instructions.length) {
            rt.ip = rt.instructions.length;
        } else {
            rt.ip = target - 1;
        }
    }],
    ['?', (rt) => {
        let target = Math.trunc(Number(rt.stack.pop()) || 0);
        const cond   = rt.stack.pop();
        if (cond === 'true') {
            if (target <= 1) {
                rt.ip = 0;
            } else if (target > rt.instructions.length) {
                rt.ip = rt.instructions.length;
            } else {
                rt.ip = target - 1;
            }
        } else {
            rt.ip++;
        }
    }],
    ['CO', (rt) => {
        rt.instructions.push('');
        rt.ip++;
    }],
    ['SO', (rt) => {
        const newOp = rt.stack.pop() ?? '';
        const targetIp = Number(rt.stack.pop());
        if (!Number.isNaN(targetIp) && targetIp >= 1 && targetIp <= rt.instructions.length) {
            rt.instructions[targetIp - 1] = newOp;
        }
        rt.ip++;
    }],
    ['iget', (rt) => {
        const targetIp = Number(rt.stack.pop());
        if (!Number.isNaN(targetIp) && targetIp >= 1 && targetIp <= rt.instructions.length) {
            rt.stack.push(rt.instructions[targetIp - 1]);
        } else {
            rt.stack.push('');
        }
        rt.ip++;
    }],
    ['i', (rt) => {
        rt.stack.push(String(rt.ip + 1));
        rt.ip++;
    }],
    ['inum', (rt) => {
        rt.stack.push(String(rt.instructions.length));
        rt.ip++;
    }],
]);
