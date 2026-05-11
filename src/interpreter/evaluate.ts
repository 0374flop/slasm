import path from 'node:path';
import type { label, directive, importDef, exportDef } from './types.js';
import { createRuntime } from './vm.js';
import { loadModule, loadInlineModules } from './loader.js';
import type { InlineModule } from '../tools/packunpack.js';
import runInstruction from './runinstruction/index.js';
import { SlasmProcess } from './process.js';

export default function evaluate(
    instructions:  string[],
    labels:        label[]        = [],
    directives:    directive[]    = [],
    clog:          string[]       = [],
    imports:       importDef[]    = [],
    basedir:       string         = process.cwd(),
    exports:       exportDef[]    = [],
    inlineModules: InlineModule[] = [],
    inputQueue:    string[] | null = null,
): SlasmProcess {
    const proc = new SlasmProcess();

    const runtime = createRuntime(instructions, labels, directives, exports, proc, inputQueue);
    runtime.clog = clog;

    const run = async () => {
        await loadInlineModules(inlineModules, runtime);
        for (const imp of imports) {
            await loadModule(imp.path, imp.namespace, runtime, basedir, imp.key);
        }

        const master = runtime.modules.get('master')!;
        while (runtime.current === 'master' && master.ip < master.instructions.length) {
            if (runtime.killed) break;
            await runInstruction(runtime);
        }

        proc.emit('done', runtime.clog);
        return runtime.clog;
    };

    const promise = run();
    promise.catch(err => {
        const e = err instanceof Error ? err : new Error(String(err));
        proc.emit('error', e);
    });

    proc.result = promise;
    proc.kill = () => { runtime.killed = true; };

    return proc;
}
