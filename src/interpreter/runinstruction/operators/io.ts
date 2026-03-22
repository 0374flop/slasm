import logger from '../../../output.js';
import { readlineSync } from '../../../readline.js';
import type { Runtime } from '../../vm.js';

type Handler = (rt: Runtime) => void;

const vm = (rt: Runtime) => rt.modules.get(rt.current)!;

export const io: Map<string, Handler> = new Map([
    ['clog', (rt) => {
        const v   = vm(rt);
        const val = v.stack.pop() ?? '';
        rt.clog.push(val);
        logger.clog(val);
        v.ip++;
    }],
    ['cnum', (rt) => {
        const v = vm(rt);
        v.stack.push(String(rt.clog.length - 1));
        v.ip++;
    }],
    ['cchan', (rt) => {
        const v   = vm(rt);
        const n   = Number(v.stack.pop());
        const val = v.stack.pop() ?? '';
        if (n < 0 || n >= rt.clog.length) throw new Error(`cchan: index ${n} out of range`);
        rt.clog[n] = val;
        v.ip++;
    }],
    ['cget', (rt) => {
        const v = vm(rt);
        const n = Number(v.stack.pop());
        if (n < 0 || n >= rt.clog.length) throw new Error(`cget: index ${n} out of range`);
        v.stack.push(rt.clog[n]);
        v.ip++;
    }],
    ['q', (rt) => {
        const v = vm(rt);
        v.stack.push(readlineSync());
        v.ip++;
    }],
]);
