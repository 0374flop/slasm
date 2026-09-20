import parse from '../interpreter/parse.js';
import tokenize from '../interpreter/tokenize.js';
import { createRuntime } from '../interpreter/vm.js';
import { SlasmProcess } from '../interpreter/process.js';
import runInstruction from '../interpreter/runinstruction/index.js';
import logger from '../output.js';
import type { label } from '../interpreter/types.js';

export type WriteEvent = {
    ip: number;
    key: number;
    val: string;
    hadWriteBefore: boolean;
};

export type ClearEvent = {
    ip: number;
    depth: number;
};

export type TraceResult = {
    writes: WriteEvent[];
    clears: ClearEvent[];
    truncated: boolean;
    clog: string[];
};

export async function traceProgram(
    instructions: string[],
    labels: label[],
    inputQueue: string[] | null = null,
    maxSteps: number = 1_000_000,
): Promise<TraceResult> {
    const rt = createRuntime(instructions.slice(), labels.map(l => ({ ...l })), new SlasmProcess(), inputQueue);

    const writes: WriteEvent[] = [];
    const clears: ClearEvent[] = [];
    const seen = new Set<number>();
    let steps = 0;

    const originalClog = logger.clog;
    logger.clog = () => {};

    try {
        while (rt.ip < rt.instructions.length && steps < maxSteps) {
            steps++;
            const op = rt.instructions[rt.ip];

            if (op === 'W' && rt.stack.length >= 2) {
                const val = rt.stack[rt.stack.length - 1];
                const key = Number(rt.stack[rt.stack.length - 2]);
                writes.push({ ip: rt.ip + 1, key, val, hadWriteBefore: seen.has(key) });
                seen.add(key);
            }

            if (op === 'clearstack') {
                clears.push({ ip: rt.ip + 1, depth: rt.stack.length });
            }

            await runInstruction(rt);
        }
    } finally {
        logger.clog = originalClog;
    }

    return { writes, clears, truncated: steps >= maxSteps, clog: rt.clog };
}

export async function trace(
    src: string,
    inputQueue: string[] | null = null,
    maxSteps: number = 1_000_000,
): Promise<TraceResult> {
    const parsed = parse(tokenize(src));
    return traceProgram(parsed.instructions, parsed.labels, inputQueue, maxSteps);
}
