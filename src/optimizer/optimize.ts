import parse from '../interpreter/parse.js';
import tokenize from '../interpreter/tokenize.js';
import decompile from '../interpreter/decompile.js';
import type { label } from '../interpreter/types.js';
import { traceProgram } from './trace.js';

type State = {
    ins: string[];
    labels: label[];
};

export type OptimizeResult = {
    source: string;
    log: string[];
};

function remove(state: State, start: number, count: number): void {
    state.ins.splice(start, count);
    const first = start + 1;
    const last = start + count;
    for (const l of state.labels) {
        if (l.ip > last) l.ip -= count;
        else if (l.ip >= first) l.ip = first;
    }
}

function isPush(ins: string[], i: number): boolean {
    return ins[i] === 'push' && i + 1 < ins.length;
}

function fromSource(src: string): State {
    const parsed = parse(tokenize(src));
    return { ins: parsed.instructions, labels: parsed.labels };
}

function toSource(state: State): string {
    return decompile(state.ins, state.labels, []);
}

function bake(state: State): void {
    const sites: number[] = [];
    for (let i = 0; i + 2 < state.ins.length; i++) {
        if (state.ins[i] === 'push' && state.ins[i + 2] === 'gln' && state.labels.some(l => l.name === state.ins[i + 1])) {
            sites.push(i);
        }
    }
    const finalIp = new Map<string, number>();
    for (const l of state.labels) {
        const removedBefore = sites.filter(s => s + 3 <= l.ip - 1).length;
        finalIp.set(l.name, l.ip - removedBefore);
    }
    for (const i of sites) state.ins[i + 1] = String(finalIp.get(state.ins[i + 1]));
    for (const i of [...sites].reverse()) remove(state, i + 2, 1);
}

export async function optimize(
    src: string,
    inputQueue: string[] | null = null,
): Promise<OptimizeResult> {
    const state = fromSource(src);
    const log: string[] = [];
    const q = () => (inputQueue ? [...inputQueue] : null);

    {
        const t = await traceProgram(state.ins, state.labels, q());
        if (t.truncated) {
            log.push('R0 skipped: trace was truncated');
        } else {
            const byIp = new Map<number, { all: string[]; firstOnly: boolean }>();
            for (const w of t.writes) {
                const a = byIp.get(w.ip) ?? { all: [], firstOnly: true };
                a.all.push(w.val);
                if (w.hadWriteBefore) a.firstOnly = false;
                byIp.set(w.ip, a);
            }
            const doomed: number[] = [];
            for (let i = 0; i < state.ins.length; i++) {
                if (state.ins[i] !== 'W') continue;
                const a = byIp.get(i + 1);
                if (!a || !a.firstOnly || !a.all.every(v => v === '0')) continue;
                if (!isPush(state.ins, i - 4) || !isPush(state.ins, i - 2)) continue;
                if (state.ins[i - 1] !== '0') continue;
                doomed.push(i);
            }
            for (const i of doomed.reverse()) {
                const key = state.ins[i - 3];
                remove(state, i - 4, 5);
                log.push(`R0 removed (W ${key} 0) (ip ${i + 1})`);
            }
        }
    }

    {
        const t = await traceProgram(state.ins, state.labels, q());
        if (t.truncated) {
            log.push('R1 skipped: trace was truncated');
        } else {
            const byIp = new Map<number, { ok: boolean; n: number }>();
            for (const c of t.clears) {
                const a = byIp.get(c.ip) ?? { ok: true, n: 0 };
                a.n++;
                if (c.depth !== 0) a.ok = false;
                byIp.set(c.ip, a);
            }
            for (let i = state.ins.length - 1; i >= 0; i--) {
                if (state.ins[i] !== 'clearstack' || (i > 0 && state.ins[i - 1] === 'push')) continue;
                const a = byIp.get(i + 1);
                if (!a) {
                    log.push(`R1 kept (clearstack) at ip ${i + 1}: never executed in the trace`);
                } else if (a.ok) {
                    log.push(`R1 removed (clearstack) at ip ${i + 1} (stack was empty all ${a.n} time${a.n === 1 ? '' : 's'})`);
                    remove(state, i, 1);
                } else {
                    log.push(`R1 kept (clearstack) at ip ${i + 1}: stack was not empty`);
                }
            }
        }
    }

    {
        const byIp = new Map<number, string[]>();
        for (const l of state.labels) {
            const names = byIp.get(l.ip) ?? [];
            names.push(l.name);
            byIp.set(l.ip, names);
        }
        for (const names of byIp.values()) {
            if (names.length < 2) continue;
            const keep = names[names.length - 1];
            for (const n of names) {
                if (n === keep) continue;
                for (let i = 0; i + 1 < state.ins.length; i++) {
                    if (state.ins[i] === 'push' && state.ins[i + 1] === n && state.ins[i + 2] === 'gln') state.ins[i + 1] = keep;
                }
                state.labels = state.labels.filter(l => l.name !== n);
                log.push(`R2 merged ${n} -> ${keep}`);
            }
        }
    }

    for (let i = 0; i + 3 < state.ins.length; i++) {
        if (state.ins[i] !== 'push' || state.ins[i + 2] !== 'gln' || state.ins[i + 3] !== 'jump') continue;
        const name = state.ins[i + 1];
        const target = state.labels.find(l => l.name === name);
        if (target && target.ip === i + 5) {
            remove(state, i, 4);
            log.push(`R3 removed jump to the next instruction (${name})`);
            i--;
        }
    }

    bake(state);
    log.push('R4 gln baked into numbers');
    state.labels = [];
    log.push('R5 label definitions removed');

    return { source: toSource(state), log };
}
