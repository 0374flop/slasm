import type { label, directive, importDef, exportDef } from './types.js';
import { createRuntime } from './vm.js';
import { loadModule } from './loader.js';
import runInstruction from './runinstruction/index.js';

export default function evaluate(
    instructions: string[],
    labels:       label[]     = [],
    directives:   directive[] = [],
    clog:         string[]    = [],
    imports:      importDef[] = [],
    basedir:      string      = process.cwd(),
    exports:      exportDef[] = [],
): string[] {
    const runtime = createRuntime(instructions, labels, directives, exports);
    runtime.clog = clog;

    for (const imp of imports) {
        loadModule(imp.path, imp.namespace, runtime, basedir);
    }

    const vm = runtime.modules.get('master')!;

    while (vm.ip < vm.instructions.length) {
        runInstruction(runtime);
    }

    return runtime.clog;
}
