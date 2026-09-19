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

const helpTexts: Record<string, string> = {
    run:   `slasm run <file>\n\n  Runs a .slasm file.`,
    eval:  `slasm eval <code>\n\n  Evaluates a snippet of SLASM code directly from the command line.`,
    repl:  `slasm repl\n\n  Starts an interactive SLASM REPL.`,
    parse: `slasm parse <file|code>\n\n  Parses a .slasm file or inline code and prints the instruction list with labels.`,
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
    parse: (a) => {
        const src = fs.existsSync(a[0])
            ? fs.readFileSync(a[0], { encoding: 'utf-8' })
            : a.join(' ');
        const result = slasm.parse(slasm.tokenize(src));
        console.log(prettyParse(result.instructions, result.labels, result.comments));
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
  parse <file|code>  parse and print instruction list
  help`);
    },
};

const args  = process.argv.slice(2);
const first = args[0];

(async () => {
    if (!first) {
        await repl();
        process.exit(0);
    }

    if (commands[first]) {
        const a = args.slice(1);
        if (a.includes('-h') || a.includes('--help')) {
            console.log(helpTexts[first] ?? `no help available for '${first}'`);
            process.exit(0);
        }
        try {
            await commands[first](a);
        } catch (e) {
            console.error(e instanceof Error ? e.message : e);
            process.exit(1);
        }
        process.exit(0);
    }

    if (fs.existsSync(first)) {
        try {
            await runFile(first);
            process.exit(0);
        } catch (e) {
            console.error(e instanceof Error ? e.message : e);
            process.exit(1);
        }
    }

    commands.help([]);
    process.exit(1);
})();
