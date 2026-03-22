import type { Runtime } from '../vm.js';
import { arithmetic } from './operators/arithmetic.js';
import { memory }     from './operators/memory.js';
import { stack }      from './operators/stack.js';
import { strings }    from './operators/strings.js';
import { io }         from './operators/io.js';
import { control }    from './operators/control.js';
import { introspect } from './operators/introspect.js';
import { misc }       from './operators/misc.js';

const handlers: Map<string, (rt: Runtime) => void> = new Map([
    ['push', (rt) => {
        const v = rt.modules.get(rt.current)!;
        v.ip++;
        if (v.ip >= v.instructions.length) throw new Error('Missing value after push');
        v.stack.push(v.instructions[v.ip]);
        v.ip++;
    }],
    ...arithmetic,
    ...memory,
    ...stack,
    ...strings,
    ...io,
    ...control,
    ...introspect,
    ...misc,
]);

export default function runInstruction(runtime: Runtime): void {
    const vm = runtime.modules.get(runtime.current)!;
    const op = vm.instructions[vm.ip];

    const handler = handlers.get(op);
    if (!handler) throw new Error(`Undefined operator '${op}'`);
    handler(runtime);
}
