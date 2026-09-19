import logger from '../../../output.js';
import type { Runtime } from '../../vm.js';

type Handler = (rt: Runtime) => void | Promise<void>;

export const io: Map<string, Handler> = new Map([
    ['clog', (rt) => {
        const val = rt.stack.pop() ?? '';
        rt.clog.push(val);
        logger.clog(val);
        rt.emitter.emit('output', val);
        rt.ip++;
    }],
    ['cnum', (rt) => {
        rt.stack.push(String(rt.clog.length - 1));
        rt.ip++;
    }],
    ['cchan', (rt) => {
        const n   = Number(rt.stack.pop());
        const val = rt.stack.pop() ?? '';
        if (n < 0 || n >= rt.clog.length) throw new Error(`cchan: index ${n} out of range`);
        rt.clog[n] = val;
        rt.ip++;
    }],
    ['cget', (rt) => {
        const n = Number(rt.stack.pop());
        if (n < 0 || n >= rt.clog.length) throw new Error(`cget: index ${n} out of range`);
        rt.stack.push(rt.clog[n]);
        rt.ip++;
    }],
    ['q', async (rt) => {
        if (rt.inputQueue !== null) {
            if (rt.inputQueue.length === 0) {
                throw new Error('q: input queue exhausted');
            }
            rt.stack.push(rt.inputQueue.shift()!);
        } else {
            const value = await new Promise<string>((resolve) => {
                rt.emitter.emit('input', resolve);
            });
            rt.stack.push(value);
        }
        rt.ip++;
    }],
]);
