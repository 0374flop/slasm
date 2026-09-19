#!/usr/bin/env node

import fs from 'node:fs';
import readline from 'node:readline';
import slasm from "../interpreter";
import repl from "./repl";
import prettyParse from "./prettyparse";
import type { SlasmProcess } from "../interpreter/process";

function readStdinLine(): string {
    const buf = Buffer.alloc(1024);
    const n = fs.readSync(0, buf, 0, buf.length, null);
    return buf.slice(0, n).toString().replace(/\r?\n$/, '');
}

async function runFile(file: string): Promise<void> {
    if (!fs.existsSync(file)) throw new Error(`no such file: ${file}`);
    const proc: SlasmProcess = slasm.eval_slasm(fs.readFileSync(file, { encoding: 'utf-8' }));

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    proc.on('input', (reply) => rl.question('', (line) => reply(line)));
    proc.once('done',  () => rl.close());
    proc.once('error', () => rl.close());
    proc.on('error', (err) => console.error('SLASM Error:', err.message));

    await proc.result;
}

type Command = (args: string[]) => void | Promise<void>;

async function readStdin(): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf-8');
}

async function readInput(a: string[], usage: string): Promise<string> {
    if (a.length > 0) {
        return fs.existsSync(a[0])
            ? fs.readFileSync(a[0], { encoding: 'utf-8' })
            : a.join(' ');
    }
    if (process.stdin.isTTY) throw new Error(usage);
    return readStdin();
}

const helpTexts: Record<string, string> = {
    run: `slasm run <file>\n\n  Runs a .slasm file.`,
    eval: `slasm eval <code>\n\n  Evaluates a snippet of SLASM code directly from the command line.`,
    repl: `slasm repl\n\n  Starts an interactive SLASM REPL.`,
    parse: `slasm parse <file|code>\n\n  Parses a .slasm file or inline code and prints the instruction list with labels.\n  With no argument, reads code from stdin.`,
    decompile: `slasm decompile <file.json|json>\n\n  Turns a flat instruction array into readable slasm code.\n  Input is JSON [instructions, labels?, comments?] (what 'slasm compile' outputs):\n  a file, the JSON itself as an argument, or stdin when no argument is given.`,
    compile: `slasm compile <file|code>\n\n  Compiles slasm code to JSON: [instructions, labels, comments].\n  Input is a .slasm file, inline code, or stdin when no argument is given.\n  Feed the result to 'slasm decompile'.`,
    format: `slasm format <file|code>\n\n  Prints slasm code in a normalized, pretty form.\n  Takes slasm text only: a .slasm file, inline code, or stdin when no argument is given.`,
};

const commands: Record<string, Command> = {
    run: async (a) => {
        if (!a[0]) throw new Error('usage: slasm run <file>');
        await runFile(a[0]);
    },
    eval: async (a) => {
        const proc = slasm.eval_slasm(a.join(' '));
        proc.on('input', (reply) => reply(readStdinLine()));
        await proc.result;
    },
    repl: async () => {
        await repl();
        process.exit(0);
    },
    parse: async (a) => {
        const src = await readInput(a, 'usage: slasm parse <file|code>  (or pipe code via stdin)');
        const result = slasm.parse(slasm.tokenize(src));
        console.log(prettyParse(result.instructions, result.labels, result.comments));
    },
    decompile: async (a) => {
        const src = await readInput(a, 'usage: slasm decompile <file.json|json>  (or pipe JSON via stdin)');
        let data: unknown;
        try {
            data = JSON.parse(src);
        } catch {
            throw new Error('decompile: input is not valid JSON');
        }
        if (!Array.isArray(data) || !Array.isArray(data[0])) {
            throw new Error('decompile: expected JSON [instructions, labels?, comments?]');
        }
        const [instr, labels, comments] = data;
        console.log(slasm.decompile(instr, labels ?? [], comments ?? []));
    },
    compile: async (a) => {
        const src = await readInput(a, 'usage: slasm compile <file|code>  (or pipe code via stdin)');
        console.log(JSON.stringify(slasm.compile(src)));
    },
    format: async (a) => {
        const src = await readInput(a, 'usage: slasm format <file|code>  (or pipe code via stdin)');
        console.log(slasm.format(src));
    },
    help: () => {
        console.log(`slasm

usage:
  slasm <file>
  slasm <command> [args]

commands:
  run <file>     run a .slasm file
  eval <code>    evaluate inline SLASM code
  repl           interactive REPL
  parse [file|code]       parse and print instruction list
  format [file|code]      pretty-print slasm code
  compile [file|code]     slasm code -> JSON [instructions, labels, comments]
  decompile [file|json]   JSON -> readable slasm code
  (parse/format/compile/decompile read stdin when given no argument)
  help`);
    },
};

const args  = process.argv.slice(2);
const first = args[0];

function exit(code: number): void {
    let pending = 2;
    const done = () => { if (--pending === 0) process.exit(code); };
    process.stdout.write('', done);
    process.stderr.write('', done);
}

(async () => {
    if (!first) {
        await repl();
        process.exit(0);
    }

    if (commands[first]) {
        const a = args.slice(1);
        if (a.includes('-h') || a.includes('--help')) {
            console.log(helpTexts[first] ?? `no help available for '${first}'`);
            exit(0);
            return;
        }
        try {
            await commands[first](a);
        } catch (e) {
            console.error(e instanceof Error ? e.message : e);
            exit(1);
            return;
        }
        exit(0);
        return;
    }

    if (fs.existsSync(first)) {
        try {
            await runFile(first);
            exit(0);
        } catch (e) {
            console.error(e instanceof Error ? e.message : e);
            exit(1);
        }
        return;
    }

    commands.help([]);
    exit(1);
})();
