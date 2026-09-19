import type { Runtime } from '../vm.js';
import { arithmetic } from './operators/arithmetic.js';
import { memory }     from './operators/memory.js';
import { stack }      from './operators/stack.js';
import { strings }    from './operators/strings.js';
import { io }         from './operators/io.js';
import { control }    from './operators/control.js';
import { misc }       from './operators/misc.js';

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

export default async function runInstruction(runtime: Runtime): Promise<void> {
    const op = runtime.instructions[runtime.ip];

    const handler = handlers.get(op);
    if (!handler) throw new Error(`Undefined operator '${op}'`);
    await handler(runtime);
}
