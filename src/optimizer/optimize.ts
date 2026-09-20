import parse from '../interpreter/parse.js';
import tokenize from '../interpreter/tokenize.js';
import { trace } from './trace.js';

const GLN = /\(gln ([^\s()]+)\)/g;
const DEF = /^;-([^\s;]+)-;$/;

function compile(src: string) {
    return parse(tokenize(src));
}

function ipOfLine(lines: string[], index: number): number {
    return compile(lines.slice(0, index + 1).join('\n')).instructions.length;
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type OptimizeResult = {
    source: string;
    log: string[];
};

export async function optimize(
    src: string,
    inputQueue: string[] | null = null,
): Promise<OptimizeResult> {
    let lines = src.split('\n');
    const log: string[] = [];
    const labels = () => compile(lines.join('\n')).labels;

    {
        const t = await trace(lines.join('\n'), inputQueue ? [...inputQueue] : null);
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
            const zeroIps = new Set<number>();
            for (const [ip, a] of byIp) {
                if (a.firstOnly && a.all.every(v => v === '0')) zeroIps.add(ip);
            }
            const out: string[] = [];
            for (let i = 0; i < lines.length; i++) {
                const m = lines[i].match(/^\(W (\d+) 0\)$/);
                if (m) {
                    const ip = ipOfLine(lines, i);
                    if (zeroIps.has(ip)) {
                        log.push(`R0 removed ${lines[i]} (ip ${ip})`);
                        continue;
                    }
                }
                out.push(lines[i]);
            }
            lines = out;
        }
    }

    {
        const t = await trace(lines.join('\n'), inputQueue ? [...inputQueue] : null);
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
            const out: string[] = [];
            for (let i = 0; i < lines.length; i++) {
                if (lines[i] === '(clearstack)') {
                    const ip = ipOfLine(lines, i);
                    const a = byIp.get(ip);
                    if (!a) {
                        log.push(`R1 kept (clearstack) at ip ${ip}: never executed in the trace`);
                    } else if (a.ok) {
                        log.push(`R1 removed (clearstack) at ip ${ip} (stack was empty all ${a.n} times)`);
                        continue;
                    } else {
                        log.push(`R1 kept (clearstack) at ip ${ip}: stack was not empty`);
                    }
                }
                out.push(lines[i]);
            }
            lines = out;
        }
    }

    {
        const byIp = new Map<number, string[]>();
        for (const l of labels()) {
            const names = byIp.get(l.ip) ?? [];
            names.push(l.name);
            byIp.set(l.ip, names);
        }
        for (const names of byIp.values()) {
            if (names.length < 2) continue;
            const keep = names[names.length - 1];
            for (const n of names) {
                if (n === keep) continue;
                const re = new RegExp(`\\(gln ${escapeRegExp(n)}\\)`, 'g');
                lines = lines
                    .filter(x => x !== `;-${n}-;`)
                    .map(x => x.replace(re, `(gln ${keep})`));
                log.push(`R2 merged ${n} -> ${keep}`);
            }
        }
    }

    for (let i = 0; i + 1 < lines.length; i++) {
        const m = lines[i].match(/^\(jump \(gln ([^\s()]+)\)\)$/);
        const d = lines[i + 1].match(DEF);
        if (m && d && m[1] === d[1]) {
            lines.splice(i, 1);
            i--;
            log.push(`R3 removed jump to the next instruction (${m[1]})`);
        }
    }

    {
        const known = new Set(labels().map(l => l.name));
        const stub = lines.join('\n').replace(GLN, (m, n: string) => (known.has(n) ? '0' : m));
        const ipOf = new Map(compile(stub).labels.map(l => [l.name, l.ip] as const));
        lines = lines.map(x => x.replace(GLN, (m, n: string) => (ipOf.has(n) ? String(ipOf.get(n)) : m)));
        log.push('R4 gln baked into numbers');
        lines = lines.filter(x => !DEF.test(x));
        log.push('R5 label definitions removed');
    }

    return { source: lines.join('\n'), log };
}
