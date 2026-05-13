import type { label, directive, importDef, exportDef } from './types.js';
import { createRuntime } from './vm.js';
import { loadModule } from './loader.js';
import runInstruction from './runinstruction/index.js';
import { SlasmProcess } from './process.js';

export default function evaluate(
    instructions: string[],
    labels:       label[]         = [],
    directives:   directive[]     = [],
    clog:         string[]        = [],
    imports:      importDef[]     = [],
    basedir:      string          = process.cwd(),
    exports:      exportDef[]     = [],
    inputQueue:   string[] | null = null,
): SlasmProcess {
    const proc = new SlasmProcess();

    const runtime = createRuntime(instructions, labels, directives, exports, proc, inputQueue);
    runtime.clog = clog;

    proc.on('event', (name: string, ...args: any[]) => {
        runtime.pendingEvents.push({ name, args });
    });

    const handleEvents = async () => {
        while (runtime.pendingEvents.length > 0) {
            const ev = runtime.pendingEvents.shift()!;
            const handlers = runtime.events.get(ev.name);
            if (!handlers) continue;

            const v = runtime.modules.get(runtime.current)!;
            for (const a of ev.args) v.stack.push(a);

            for (const fref of handlers) {
                const [ns, ipStr, argsStr, retsStr] = fref.split(':');
                const targetMod = runtime.modules.get(ns);
                if (!targetMod) continue;

                const ip      = Number(ipStr);
                const args    = Number(argsStr);
                const returns = Number(retsStr);

                const argVals = ev.args.slice(ev.args.length - args);
                const stackBase = targetMod.stack.length;

                runtime.callstack.push({ namespace: runtime.current, ip: targetMod.ip + 1, returns, stackBase });
                runtime.current = ns;
                targetMod.ip = ip - 1;
                for (const val of argVals) targetMod.stack.push(val);

                while (runtime.current === ns && targetMod.ip < targetMod.instructions.length && targetMod.ip >= 0) {
                    await runInstruction(runtime);
                    if (runtime.callstack.length === 0) break;
                    const topFrame = runtime.callstack[runtime.callstack.length - 1];
                    if (topFrame.namespace !== ns && runtime.current !== ns) break;
                }
            }
        }
    };

    const run = async () => {
        for (const imp of imports) {
            await loadModule(imp.path, imp.namespace, runtime, basedir, imp.key);
        }

        const master = runtime.modules.get('master')!;
        while (master.ip < master.instructions.length || runtime.current !== 'master') {
            if (runtime.killed) break;

            await handleEvents();

            await runInstruction(runtime);

            const currentVm = runtime.modules.get(runtime.current)!;

            if (runtime.current !== 'master' && currentVm.ip >= currentVm.instructions.length) {
                runtime.current = 'master';
            }
        }

        if (runtime.events.size > 0) {
            await new Promise<void>(resolve => {
                // используем таймер только чтобы держать процесс живым
                // реальная работа идёт через proc.on('event')
                const keepalive = setInterval(() => {}, 2147483647);

                proc.on('event', (name: string) => {
                    setImmediate(async () => {
                        await handleEvents();
                        if (runtime.events.size === 0 || runtime.killed) {
                            clearInterval(keepalive);
                            resolve();
                        }
                    });
                });

                if (runtime.killed) {
                    clearInterval(keepalive);
                    resolve();
                }
            });
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
