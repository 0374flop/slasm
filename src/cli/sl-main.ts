#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { Command, CommanderError } from 'commander';
import slasm from "../interpreter";
import { optimize } from '../optimizer/optimize';
import repl from "./repl";
import prettyParse from "./prettyparse";
import type { SlasmProcess } from "../interpreter/process";

import packageJson from '../../package.json';

function readStdinLine(): string {
    const buf = Buffer.alloc(1024);
    const n = fs.readSync(0, buf, 0, buf.length, null);
    return buf.slice(0, n).toString().replace(/\r?\n$/, '');
}

async function runFile(file: string): Promise<void> {
    if (!fs.existsSync(file)) throw new Error(`no such file: ${file}`);
    const proc: SlasmProcess = slasm.eval_slasm(fs.readFileSync(file, { encoding: 'utf-8' }));

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    proc.on('output', (value) => process.stdout.write(`${value}\n`));
    proc.on('input', (reply) => rl.question('', (line) => reply(line)));
    proc.once('done',  () => rl.close());
    proc.once('error', () => rl.close());
    proc.on('error', (err) => console.error('slasm Error:', err.message));

    await proc.result;
}

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

function getFilesFromDir(dir: string, all: boolean): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(getFilesFromDir(fullPath, all));
        } else if (entry.isFile()) {
            if (all || entry.name.endsWith('.slasm')) {
                results.push(fullPath);
            }
        }
    }
    return results.sort();
}

const program = new Command()
    .name('slasm')
    .description(`slasm interpreter and tools. (npm package ${packageJson.name}, v${packageJson.version})`)
    .version(packageJson.version)
    .option('-d, --dir <dir>', 'run all files in directory')
    .option('-a, --all', 'run all files in directory regardless of extension')
    .option('-l, --list <files...>', 'run list of files')
    .argument('[file]', 'run a .slasm file')
    .exitOverride();

program
    .action(async (file?: string, options?: { dir?: string; all?: boolean; list?: string[] }) => {
        const opts = options || {};
        if (opts.dir) {
            const files = getFilesFromDir(opts.dir, !!opts.all);
            if (files.length === 0) {
                console.error(`no files found in directory: ${opts.dir}`);
                process.exitCode = 1;
                return;
            }
            for (const f of files) {
                await runFile(f);
            }
            return;
        }

        if (opts.list && opts.list.length > 0) {
            for (const f of opts.list) {
                await runFile(f);
            }
            return;
        }

        if (!file) {
            console.error(`slasm, v${packageJson.version}.\nType '.exit' or 'exit' to exit the REPL.`);
            await repl();
            return;
        }
        if (!fs.existsSync(file)) {
            program.outputHelp();
            process.exitCode = 1;
            return;
        }
        await runFile(file);
    });

program
    .command('run <file>')
    .description('run a .slasm file')
    .action(async (file: string) => runFile(file));

program
    .command('eval [code...]')
    .description('evaluate inline slasm code')
    .action(async (code: string[]) => {
        const src = code.length > 0
            ? code.join(' ')
            : process.stdin.isTTY ? '' : await readStdin();
        const proc = slasm.eval_slasm(src);
        proc.on('output', (value) => process.stdout.write(`${value}\n`));
        proc.on('input', (reply) => reply(readStdinLine()));
        await proc.result;
    });

program
    .command('repl')
    .description('start an interactive slasm REPL')
    .action(async () => repl());

program
    .command('parse [input...]')
    .description('parse slasm code and print its instruction list for debugging purposes (pretty-parser)')
    .action(async (input: string[]) => {
        const src = await readInput(input, 'usage: slasm parse <file|code>  (or pipe code via stdin)');
        const result = slasm.parse(slasm.tokenize(src));
        console.log(prettyParse(result.instructions, result.labels, result.comments));
    });

program
    .command('decompile [input...]')
    .description('turn compiled JSON into readable slasm code')
    .action(async (input: string[]) => {
        const src = await readInput(input, 'usage: slasm decompile <file.json|json>  (or pipe JSON via stdin)');
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
    });

program
    .command('compile [input...]')
    .description('compile slasm code to JSON')
    .action(async (input: string[]) => {
        const src = await readInput(input, 'usage: slasm compile <file|code>  (or pipe code via stdin)');
        console.log(JSON.stringify(slasm.compile(src)));
    });

program
    .command('format [input...]')
    .description('print normalized slasm code')
    .action(async (input: string[]) => {
        const src = await readInput(input, 'usage: slasm format <file|code>  (or pipe code via stdin)');
        console.log(slasm.format(src));
    });

program
    .command('optimize [input...]')
    .description('optimize slasm code')
    .option('--log', 'print the optimization log to stderr')
    .action(async (input: string[], options: { log?: boolean }) => {
        const src = await readInput(input, 'usage: slasm optimize <file|code>  (or pipe code via stdin)');
        const result = await optimize(src);
        console.log(result.source);
        if (options.log) {
            for (const entry of result.log) console.error(entry);
        }
    });

void program.parseAsync(process.argv).catch((error: unknown) => {
    if (error instanceof CommanderError) {
        process.exitCode = error.exitCode;
        return;
    }
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
