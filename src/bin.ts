#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import slasm from "./interpreter";
import repl from "./repl";
import run from "./run";
import { decompileFile } from "./decompiler";
import prettyParse from "./prettyparse";

type Command = (args: string[]) => void;

const args: string[] = process.argv.slice(2);
const first: string | undefined = args[0];

const commands: Record<string, Command> = {
    run: (a) => run(a[0]),
    eval: (a) => slasm.eval_slasm(a.join(' ')),
    repl: () => replLoop(),
    parse: (a) => {
        const parsedata = slasm.parse(slasm.tokenize(a.join(' ')));
        console.log(prettyParse(parsedata[0], parsedata[1], parsedata[2]));
    },
    pack: (a) => console.log(slasm.SLASMBin.packFile(a[0], a.includes('z'))),
    unpack: (a) => console.log(slasm.SLASMBin.unpackFile(a[0])),
    decompile: (a) => {
        const result = decompileFile(a[0]);
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
  pack <file> [z]
  unpack <file>
  decompile <file> [--out]
  help`);
    }
};

function replLoop(): never {
    while (true) repl();
}

if (!first) {
    replLoop();
}

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