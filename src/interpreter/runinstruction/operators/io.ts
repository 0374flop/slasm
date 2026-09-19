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
