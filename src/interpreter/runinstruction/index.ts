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
    if (handler) { handler(runtime); return; }

    let targetNs: string | undefined;
    let targetIp: number | undefined;
    let targetArgs = 0;
    let targetReturns = 0;

    const dotIdx = op.indexOf('.');
    const isNsQualified = dotIdx !== -1;

    if (isNsQualified) {
        const ns   = op.slice(0, dotIdx);
        const func = op.slice(dotIdx + 1);

        const nativeMod = runtime.nativeModules.get(ns);
        if (nativeMod) {
            const exp = nativeMod.get(func);
            if (!exp) throw new Error(`'${func}' not found in native module '${ns}'`);
            const argVals: string[] = [];
            for (let i = 0; i < exp.args; i++) {
                const val = vm.stack.pop();
                if (val === undefined) throw new Error(`${op}: not enough arguments (need ${exp.args})`);
                argVals.unshift(val);
            }
            const results = exp.fn(argVals);
            for (const r of results) vm.stack.push(r);
            vm.ip++;
            return;
        }

        const slasmMod = runtime.modules.get(ns);
        if (!slasmMod) throw new Error(`module '${ns}' not loaded`);
        const exp = slasmMod.exports.find(e => e.name === func);
        if (!exp) throw new Error(`'${func}' not found in module '${ns}'`);
        targetNs      = ns;
        targetIp      = exp.ip;
        targetArgs    = exp.args;
        targetReturns = exp.returns;

    } else {
        const localExp = vm.exports.find(e => e.name === op);
        if (localExp) {
            targetNs      = runtime.current;
            targetIp      = localExp.ip;
            targetArgs    = localExp.args;
            targetReturns = localExp.returns;
        }

        if (!targetNs) {
            for (const [ns, mod] of runtime.modules) {
                if (ns === runtime.current) continue;
                const exp = mod.exports.find(e => e.name === op);
                if (exp) {
                    targetNs      = ns;
                    targetIp      = exp.ip;
                    targetArgs    = exp.args;
                    targetReturns = exp.returns;
                    break;
                }
            }
        }

        if (!targetNs) {
            for (const [, nativeMod] of runtime.nativeModules) {
                const exp = nativeMod.get(op);
                if (exp) {
                    const argVals: string[] = [];
                    for (let i = 0; i < exp.args; i++) {
                        const val = vm.stack.pop();
                        if (val === undefined) throw new Error(`${op}: not enough arguments (need ${exp.args})`);
                        argVals.unshift(val);
                    }
                    const results = exp.fn(argVals);
                    for (const r of results) vm.stack.push(r);
                    vm.ip++;
                    return;
                }
            }
        }

        if (!targetNs || targetIp === undefined) {
            throw new Error(`Undefined operator '${op}'`);
        }
    }

    const argVals: string[] = [];
    for (let i = 0; i < targetArgs; i++) {
        const val = vm.stack.pop();
        if (val === undefined) throw new Error(`${op}: not enough arguments (need ${targetArgs})`);
        argVals.unshift(val);
    }

    const targetMod = runtime.modules.get(targetNs)!;
    const stackBase = targetMod.stack.length;
    runtime.callstack.push({ namespace: runtime.current, ip: vm.ip + 1, returns: targetReturns, stackBase });
    runtime.current = targetNs;
    targetMod.ip = targetIp - 1;
    for (const val of argVals) targetMod.stack.push(val);
}
