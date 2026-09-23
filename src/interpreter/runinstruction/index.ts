import type { Runtime } from '../vm.js';
import { SlasmError } from '../errors.js';
import { arithmetic } from './operators/arithmetic.js';
import { memory } from './operators/memory.js';
import { stack } from './operators/stack.js';
import { strings } from './operators/strings.js';
import { io } from './operators/io.js';
import { control } from './operators/control.js';
import { misc } from './operators/misc.js';

type Handler = (rt: Runtime) => void | Promise<void>;

const handlers: Map<string, Handler> = new Map([
    ['push', (rt) => {
        rt.ip++;
        if (rt.ip >= rt.instructions.length) throw new Error('Missing value after push');
        rt.stack.push(rt.instructions[rt.ip]);
        rt.ip++;
    }],
    ...Array.from(arithmetic.entries()),
    ...Array.from(memory.entries()),
    ...Array.from(stack.entries()),
    ...Array.from(strings.entries()),
    ...Array.from(io.entries()),
    ...Array.from(control.entries()),
    ...Array.from(misc.entries()),
]);

const MAX_STACK_SIZE = 20000;

export default async function runInstruction(runtime: Runtime): Promise<void> {
    const ip = runtime.ip + 1;
    const op = runtime.instructions[runtime.ip];

    try {
        const handler = handlers.get(op);
        if (!handler) throw new Error(`Undefined operator '${op}'`);
        await handler(runtime);

        if (runtime.stack.length > MAX_STACK_SIZE) {
            throw new Error(`Stack overflow: exceeded limit of ${MAX_STACK_SIZE}`);
        }
    } catch (err) {
        if (err instanceof SlasmError) throw err;
        const message = err instanceof Error ? err.message : String(err);
        throw new SlasmError('runtime', message, ip, op);
    }
}
