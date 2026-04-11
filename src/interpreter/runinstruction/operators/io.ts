import logger from '../../../output.js';
import type { Runtime } from '../../vm.js';

type Handler = (rt: Runtime) => void | Promise<void>;

const vm = (rt: Runtime) => rt.modules.get(rt.current)!;

export const io: Map<string, Handler> = new Map([
    ['clog', (rt) => {
        const v   = vm(rt);
        const val = v.stack.pop() ?? '';
        rt.clog.push(val);
        logger.clog(val);
        rt.emitter.emit('output', val);
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
    ['q', async (rt) => {
        const v = vm(rt);
        if (rt.inputQueue !== null) {
            if (rt.inputQueue.length === 0) {
                throw new Error('q: input queue exhausted');
            }
            v.stack.push(rt.inputQueue.shift()!);
        } else {
            const value = await new Promise<string>((resolve) => {
                rt.emitter.emit('input', resolve);
            });
            v.stack.push(value);
        }
        v.ip++;
    }],
]);
