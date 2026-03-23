#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import slasm from "../interpreter";
import repl from "./repl";
import run from "../tools/run";
import { decompileFile } from "../tools/decompiler";
import prettyParse from "./prettyparse";
import { encryptFile, decryptFile } from "../tools/encrypt";
import fetchModules from "../tools/fetch";

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

function requireKey(a: string[]): string {
    return readKey(a) ?? readStdin('Enter key: ');
}

type Command = (args: string[]) => void;

const args: string[] = process.argv.slice(2);
const first: string | undefined = args[0];

if (args.includes('--update-modules')) process.env.SLASM_UPDATE_MODULES = '1';

const commands: Record<string, Command> = {
    fetch: (a) => fetchModules(a[0], a.includes('--update')).then(() => {}).catch(e => { console.error(e.message); process.exit(1); }),
    run: (a) => run(a[0], readKey(a)),
    eval: (a) => slasm.eval_slasm(a.join(' ')),
    repl: () => replLoop(),
    parse: (a) => {
        const parsedata = slasm.parse(slasm.tokenize(a.join(' ')));
        console.log(prettyParse(parsedata.instructions, parsedata.labels, parsedata.comments));
    },
    pack: (a) => console.log(slasm.SLASMBin.packFile(a[0], a.includes('z'), readKey(a), !a.includes('--nomodules'))),
    unpack: (a) => console.log(slasm.SLASMBin.unpackFile(a[0], readKey(a))),
    encrypt: (a) => console.log(encryptFile(a[0], requireKey(a))),
    decrypt: (a) => console.log(decryptFile(a[0], requireKey(a))),
    decompile: (a) => {
        const result = decompileFile(a[0], readKey(a));
        if (a.includes('--out')) {
            const p = path.normalize(a[0]);
            const ext = path.extname(p);
            const outPath = path.join(path.dirname(p), path.basename(p, ext) + '.decompiled.slasm');
            fs.writeFileSync(outPath, result, { encoding: 'utf-8' });
            console.log(outPath);
        } else {
            console.log(result);
        }
    },
    help: () => {
        console.log(`slasm

usage:
  slasm <file>
  slasm <command> [...args]

commands:
  run <file>
  eval <code>
  repl
  parse <code>
  pack <file> [z] [--key[=]<key>]
  unpack <file> [--key[=]<key>]
  encrypt <file.slasmbin|.slasmz> [--key[=]<key>]  (overwrites in-place)
  decrypt <file.slasmbin|.slasmz> [--key[=]<key>]  (overwrites in-place)
  fetch <file> [--update]
  decompile <file> [--out] [--key[=]<key>]
  (if --key is omitted where needed, reads from stdin)
  help`);
    }
};

function replLoop(): never {
    while (true) repl();
}

if (!first) replLoop();

if (first && commands[first]) {
    try {
        commands[first](args.slice(1));
    } catch (e) {
        console.error(e instanceof Error ? e.message : e);
        process.exit(1);
    }
    process.exit(0);
}

if (first && fs.existsSync(first)) {
    run(first);
    process.exit(0);
}

commands.help([]);
process.exit(1);
