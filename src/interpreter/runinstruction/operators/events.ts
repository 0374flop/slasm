import type { Runtime } from '../../vm.js';

type Handler = (rt: Runtime) => void | Promise<void>;

const vm = (rt: Runtime) => rt.modules.get(rt.current)!;

export const events: Map<string, Handler> = new Map([
    ['on', (rt) => {
        const v    = vm(rt);
        const fref = v.stack.pop() ?? '';
        const name = v.stack.pop() ?? '';
        if (!rt.events.has(name)) rt.events.set(name, []);
        rt.events.get(name)!.push(fref);
        v.ip++;
    }],
    ['emit', async (rt) => {
        const v    = vm(rt);
        const name = v.stack.pop() ?? '';
        const handlers = rt.events.get(name);
        if (handlers) {
            const data: string[] = [];
            while (v.stack.length > 0) data.push(v.stack.pop()!);
            data.reverse(); // Keep original order
            
            for (const fref of handlers) {
                const [ns, ipStr, argsStr, retsStr] = fref.split(':');
                const targetMod = rt.modules.get(ns);
                if (!targetMod) continue;

                const ip      = Number(ipStr);
                const args    = Number(argsStr);
                const returns = Number(retsStr);

                const argVals = data.slice(data.length - args);
                const stackBase = targetMod.stack.length;
                
                rt.callstack.push({ namespace: rt.current, ip: v.ip + 1, returns, stackBase });
                rt.current = ns;
                targetMod.ip = ip - 1;
                for (const val of argVals) targetMod.stack.push(val);
                
                while (rt.current === ns && targetMod.ip < targetMod.instructions.length && targetMod.ip >= 0) {
                    const { default: runInstruction } = await import('../index.js');
                    await runInstruction(rt);
                    if (rt.callstack.length === 0) break;
                    const topFrame = rt.callstack[rt.callstack.length - 1];
                    if (topFrame.namespace !== ns && rt.current !== ns) break;
                }
            }
        }
        v.ip++;
    }],
]);
