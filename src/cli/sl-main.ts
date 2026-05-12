#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import slasm from "../interpreter";
import repl from "./repl";
import run from "../tools/run";
import prettyParse from "./prettyparse";
import { findProjectRoot, readSlasmJson } from "../tools/fetch";

function readStdin(prompt: string): string {
    process.stderr.write(prompt);
    const buf = Buffer.alloc(1024);
    const n = fs.readSync(0, buf, 0, buf.length, null);
    return buf.slice(0, n).toString().replace(/\r?\n$/, '');
}

function readKey(a: string[]): string | undefined {
    for (let i = 0; i < a.length; i++) {
        if (a[i].startsWith('--key=')) return a[i].slice('--key='.length);
        if (a[i] === '--key') {
            const val = a[i + 1];
            if (!val || val.startsWith('--')) return readStdin('Enter key: ');
            return val;
        }
    }
    return undefined;
}

type Command = (args: string[]) => void | Promise<void>;

const helpTexts: Record<string, string> = {
    run: `slasm run [file] [--key[=]<key>]

  Runs a .slasm, .slasmbin, .slasmz, .slasmjson, .slpkg, .slpkgz, or .slpkgj file.
  If no file given and slasm.json exists in cwd, runs the main file from it.

  --key=<key>   decryption key for encrypted binaries`,

    eval: `slasm eval <code>

  Evaluates a snippet of SLASM code directly from the command line.`,

    repl: `slasm repl

  Starts an interactive SLASM REPL.`,

    parse: `slasm parse <file|code>

  Parses a .slasm file or inline code and prints the instruction list with labels.`,

};

const commands: Record<string, Command> = {
    run: async (a) => {
        const key = readKey(a);
        const file = a.find(x => !x.startsWith('--'));
        if (file) { await run(file, key); return; }
        const root = findProjectRoot(process.cwd());
        if (!root) throw new Error('no slasm.json found — run: sl-pm init');
        const json = readSlasmJson(root);
        if (!json.main) throw new Error('no "main" field in slasm.json');
        await run(path.join(root, json.main), key);
    },
    eval: async (a) => {
        const proc = slasm.eval_slasm(a.join(' '));
        proc.on('input', (reply) => {
            const buf = Buffer.alloc(1024);
            const n = fs.readSync(0, buf, 0, buf.length, null);
            reply(buf.slice(0, n).toString().replace(/\r?\n$/, ''));
        });
        await proc.result;
    },
    repl: () => replLoop(),
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
  run          run a .slasm / .slasmbin / .slasmz / .slasmjson / .slpkg file
  eval         evaluate inline SLASM code
  repl         interactive REPL
  parse        parse and print instruction list

related tools:
  sl-pkg       pack, unpack, convert, encrypt, decompile
  sl-pm        install, uninstall, init modules`);
    }
};

async function replLoop(): Promise<never> {
    await repl();
    process.exit(0);
}

const args = process.argv.slice(2);
const first = args[0];

if (!first) replLoop();

(async () => {
    if (first && commands[first]) {
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

    if (first && fs.existsSync(first)) {
        try {
            await run(first);
            process.exit(0);
        } catch (e) {
            console.error(e instanceof Error ? e.message : e);
            process.exit(1);
        }
        return;
    }

    commands.help([]);
    process.exit(1);
})();
