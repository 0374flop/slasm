import type { label } from './types.js';
import { createRuntime } from './vm.js';
import runInstruction from './runinstruction/index.js';
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

    proc.kill = () => {
        runtime.ip = runtime.instructions.length;
    };

    const run = async () => {
        while (runtime.ip < runtime.instructions.length) {
            await runInstruction(runtime);
        }
        proc.emit('done', runtime.clog);
        return runtime.clog;
    };

    proc.result = Promise.resolve().then(run).catch(err => {
        const e = err instanceof Error ? err : new Error(String(err));
        proc.emit('error', e);
        return runtime.clog;
    });

    return proc;
}
