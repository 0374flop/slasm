import type { label, directive } from './types.js';
import { createRuntime } from './vm.js';
import runInstruction from './runinstruction/index.js';

export default function evaluate(
    instructions: string[],
    labels:       label[]     = [],
    directives:   directive[] = [],
    clog:         string[]    = [],
): string[] {
    const runtime = createRuntime(instructions, labels, directives);
    runtime.clog = clog;

    const vm = runtime.modules.get('master')!;

    while (vm.ip < vm.instructions.length) {
        runInstruction(runtime);
    }

    return runtime.clog;
}
