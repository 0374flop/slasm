import readline from 'node:readline';
import slasm from '../interpreter/index.js';
import { SlasmError } from '../interpreter/errors.js';
import type { SlasmProcess } from '../interpreter/process.js';

const HELP = [
    'commands:',
    '  <enter>, .s, .step     run next instruction',
    '  .c, .continue          run until the end (or until the injected code ends)',
    '  .stack                 show the whole stack',
    '  .mem                   show memory',
    '  .list [from] [to]      show instructions around ip (or a range)',
    '  .labels                show labels',
    '  .abort                 abort the current inject',
    '  .inject <code>         inject code but do not run it: walk through it with .step',
    '  .kill                  kill the program',
    '  .help                  show this help',
    '  .exit, .q              leave the debugger',
    'anything else is slasm code: it is injected at the current ip, runs',
    'with the real stack and memory, and ip is restored afterwards',
].join('\n');

const formatError = (error: unknown): string =>
    error instanceof SlasmError ? error.format() : error instanceof Error ? error.message : String(error);

function opAt(proc: SlasmProcess, ip: number): string {
    const op = proc.instructions[ip - 1];
    if (op === undefined) return '<end>';
    if (op === 'push') {
        const val = proc.instructions[ip];
        return val === undefined ? 'push' : `push ${val}`;
    }
    return op;
}

function stackPreview(stack: string[]): string {
    const shown = stack.slice(-8).map(v => (v.length > 24 ? `${v.slice(0, 21)}...` : v));
    return `[${stack.length > 8 ? '..., ' : ''}${shown.join(', ')}]`;
}

function status(proc: SlasmProcess): string {
    if (proc.finished) return `done  stack=${stackPreview(proc.stack)}`;
    const tag = proc.injecting ? ' [inject]' : '';
    return `ip=${proc.ip} (${opAt(proc, proc.ip)})${tag}  stack=${stackPreview(proc.stack)}`;
}

function list(proc: SlasmProcess, from?: number, to?: number): string {
    const total = proc.instructions.length;
    const lo = Math.max(1, from ?? proc.ip - 4);
    const hi = Math.min(total, to ?? (from === undefined ? proc.ip + 6 : lo + 10));
    const labelAt = new Map<number, string[]>();
    for (const l of proc.labels) {
        const names = labelAt.get(l.ip) ?? [];
        names.push(l.name);
        labelAt.set(l.ip, names);
    }
    const width = String(total).length;
    const lines: string[] = [];
    for (let ip = lo; ip <= hi; ip++) {
        for (const name of labelAt.get(ip) ?? []) lines.push(`${' '.repeat(width + 3)};-${name}-;`);
        const marker = ip === proc.ip ? '>' : ' ';
        lines.push(`${marker} ${String(ip).padStart(width)}  ${proc.instructions[ip - 1]}`);
    }
    if (lines.length === 0) lines.push('(nothing to show)');
    return lines.join('\n');
}

export default async function debug(program: string, inputQueue: string[] | null = null): Promise<void> {
    let proc: SlasmProcess;
    try {
        proc = slasm.eval_slasm(program, inputQueue);
    } catch (error) {
        console.error(formatError(error));
        process.exitCode = 1;
        return;
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (prompt: string) => new Promise<string | null>((resolve) => {
        const onClose = () => resolve(null);
        rl.once('close', onClose);
        rl.question(prompt, (line) => {
            rl.removeListener('close', onClose);
            resolve(line);
        });
    });

    proc.on('output', (value) => console.log(`| ${value}`));
    proc.on('error', (err) => console.log(formatError(err)));
    proc.on('injectdone', () => console.log('inject finished, ip restored'));
    proc.on('input', (reply) => {
        void ask('input> ').then((line) => reply(line ?? ''));
    });

    console.log(`slasm debugger. ${proc.instructions.length} instructions. type .help for commands.`);
    console.log(status(proc));

    const advance = async (fn: () => Promise<void>) => {
        try {
            await fn();
        } catch (error) {
            console.log(formatError(error));
        }
        console.log(status(proc));
    };

    while (true) {
        if (proc.finished) {
            console.log('program finished. type .exit to leave.');
        }
        const line = await ask('dbg> ');
        if (line === null) break;
        const text = line.trim();

        if (text === '.exit' || text === '.q' || text === 'exit') break;

        if (text === '' || text === '.s' || text === '.step') {
            if (proc.finished) continue;
            await advance(() => proc.step());
            continue;
        }

        if (text === '.c' || text === '.continue') {
            if (proc.finished) continue;
            await advance(() => proc.continue());
            continue;
        }

        if (text === '.help') { console.log(HELP); continue; }
        if (text === '.stack') { console.log(proc.stack.length ? proc.stack.map((v, i) => `${i + 1}: ${v}`).join('\n') : '(empty)'); continue; }
        if (text === '.mem') {
            const entries = [...proc.memory.entries()].sort((a, b) => a[0] - b[0]);
            console.log(entries.length ? entries.map(([k, v]) => `${k}: ${v}`).join('\n') : '(empty)');
            continue;
        }
        if (text === '.labels') {
            console.log(proc.labels.length ? proc.labels.map(l => `${l.name.padEnd(16)} @${l.ip}`).join('\n') : '(none)');
            continue;
        }

        if (text.startsWith('.list')) {
            const [a, b] = text.split(/\s+/).slice(1).map(Number);
            console.log(list(proc, Number.isFinite(a) ? a : undefined, Number.isFinite(b) ? b : undefined));
            continue;
        }

        if (text === '.abort') {
            if (!proc.injecting) { console.log('nothing to abort'); continue; }
            proc.abortInject();
            console.log(status(proc));
            continue;
        }

        if (text === '.kill') {
            proc.kill();
            console.log(status(proc));
            continue;
        }

        if (text === '.inject' || text.startsWith('.inject ')) {
            const code = text.slice('.inject'.length).trim();
            if (code === '') { console.log('usage: .inject <code>'); continue; }
            if (proc.finished) { console.log('program is finished, nothing to inject into'); continue; }
            if (proc.injecting) { console.log('already injecting, use .step, .c or .abort'); continue; }

            let compiled: ReturnType<typeof slasm.compile>;
            try {
                compiled = slasm.compile(code);
                proc.inject(compiled[0], compiled[1]);
            } catch (error) {
                console.log(formatError(error));
                continue;
            }
            console.log(`injected ${compiled[0].length} instructions, not running. .step to walk through, .c to run, .abort to drop`);
            console.log(status(proc));
            continue;
        }

        if (text.startsWith('.')) {
            console.log(`unknown command '${text.split(/\s+/)[0]}'. type .help`);
            continue;
        }

        if (proc.finished) { console.log('program is finished, nothing to inject into'); continue; }
        if (proc.injecting) { console.log('already injecting, use .step, .c or .abort'); continue; }

        let compiled: ReturnType<typeof slasm.compile>;
        try {
            compiled = slasm.compile(text);
        } catch (error) {
            console.log(formatError(error));
            continue;
        }

        try {
            proc.inject(compiled[0], compiled[1]);
        } catch (error) {
            console.log(formatError(error));
            continue;
        }

        await advance(() => proc.continue());
    }

    if (!proc.finished) proc.kill();
    rl.close();
}
