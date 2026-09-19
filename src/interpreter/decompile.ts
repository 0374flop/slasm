import type { label, comment } from './types.js';
import _ARITY from './runinstruction/arity.json';

const ARITY = _ARITY as unknown as Record<string, [number, number]>;

export default function decompile(
    instructions: (string | number)[],
    labels: label[] = [],
    comments: comment[] = [],
): string {
    const labelAtIp = new Map<number, string>();
    const commentAtIp = new Map<number, string>();
    for (const l of labels) labelAtIp.set(l.ip, l.name);
    for (const c of comments) commentAtIp.set(c.ip, c.text);

    const emittedLabels = new Set<number>();
    const exprStack: string[] = [];
    const output: string[] = [];
    let statementStartIp = 1;
    let i = 0;

    const emitLabels = (from: number, to: number) => {
        for (let ip = from; ip <= to; ip++) {
            if (labelAtIp.has(ip) && !emittedLabels.has(ip)) {
                output.push(`;-${labelAtIp.get(ip)}-;`);
                emittedLabels.add(ip);
            }
        }
    };

    const flushStack = () => {
        while (exprStack.length > 0) output.push(exprStack.shift()!);
    };

    while (i < instructions.length) {
        const op = String(instructions[i]);

        if (exprStack.length === 0) statementStartIp = i + 1;

        if (op === 'push') {
            if (i + 1 >= instructions.length) throw new Error('decompile: missing value after push');
            exprStack.push(String(instructions[i + 1]));
            i += 2;
            continue;
        }

        const arity = ARITY[op];

        if (arity === undefined) {
            emitLabels(statementStartIp, i + 1);
            flushStack();
            output.push(`(${op})`);
            i++;
            continue;
        }

        const [consumed, produced] = arity;

        let args: string[];
        if (consumed === -1) {
            args = [...exprStack];
            exprStack.length = 0;
        } else {
            args = [];
            for (let j = 0; j < consumed; j++) {
                const val = exprStack.pop();
                if (val !== undefined) args.unshift(val);
            }
        }

        const expr = args.length > 0 ? `(${op} ${args.join(' ')})` : `(${op})`;

        if (produced > 0) {
            exprStack.push(expr);
        } else {
            emitLabels(statementStartIp, i + 1);
            flushStack();
            const comment = commentAtIp.get(i + 1);
            output.push(comment ? `${expr} ;${comment};` : expr);
        }

        i++;
    }

    if (exprStack.length > 0) {
        output.push(';orphaned-stack-items:;');
        flushStack();
    }

    for (const [ip, name] of labelAtIp) {
        if (emittedLabels.has(ip)) continue;
        if (ip === instructions.length + 1) {
            output.push(`;-${name}-;`);
        } else {
            output.push(`;unplaced-label-${name}-at-ip-${ip};`);
        }
    }

    return output.join('\n');
}
