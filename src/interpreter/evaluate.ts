import type { label, directive, importDef, exportDef } from './types.js';
import { createRuntime } from './vm.js';
import { loadModule, loadInlineModules } from './loader.js';
import type { InlineModule } from '../tools/packunpack.js';
import runInstruction from './runinstruction/index.js';

export default function evaluate(
    instructions:  string[],
    labels:        label[]        = [],
    directives:    directive[]    = [],
    clog:          string[]       = [],
    imports:       importDef[]    = [],
    basedir:       string         = process.cwd(),
    exports:       exportDef[]    = [],
    inlineModules: InlineModule[] = [],
): string[] {
    const runtime = createRuntime(instructions, labels, directives, exports);
    runtime.clog = clog;

    loadInlineModules(inlineModules, runtime);

    for (const imp of imports) {
        loadModule(imp.path, imp.namespace, runtime, basedir, imp.key);
    }

    const vm = runtime.modules.get('master')!;

    while (vm.ip < vm.instructions.length) {
        runInstruction(runtime);
    }

    return runtime.clog;
}
