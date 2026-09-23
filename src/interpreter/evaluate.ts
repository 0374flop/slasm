import type { label } from './types.js';
import { createRuntime } from './vm.js';
import { SlasmProcess } from './process.js';

export default function evaluate(
    instructions: string[],
    labels: label[] = [],
    clog: string[] = [],
    inputQueue: string[] | null = null,
): SlasmProcess {
    const proc = new SlasmProcess();
    const runtime = createRuntime(instructions, labels, proc, inputQueue);
    runtime.clog = clog;
    proc.attach(runtime);
    return proc;
}
