#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import slasm from "../interpreter";
import repl from "./repl";
import run from "../tools/run";
import { decompileFile } from "../tools/decompiler";
import prettyParse from "./prettyparse";
import { encryptFile, decryptFile } from "../tools/encrypt";
import fetchModules, { initProject, findProjectRoot, readSlasmJson, installModules, clearLocalModules } from "../tools/fetch";

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

type Command = (args: string[]) => void | Promise<void>;

const args: string[] = process.argv.slice(2);
const first: string | undefined = args[0];

if (args.includes('--update-modules')) process.env.SLASM_UPDATE_MODULES = '1';

const commands: Record<string, Command> = {
    init: (a) => { initProject(a[0] ?? process.cwd(), a[1]); },
    install: async (a) => {
        const forceUpdate = a.includes('--update');
        const urls = a.filter(x => !x.startsWith('--'));
        if (urls.length === 0) {
            const root = findProjectRoot(process.cwd());
            if (!root) throw new Error('no slasm.json found — run: slasm init');
            const json = readSlasmJson(root);
            const existing = Object.keys(json.modules);
            if (existing.length === 0) { console.log('nothing to install'); return; }
            await installModules(existing, forceUpdate);
        } else {
            await installModules(urls, forceUpdate);
        }
    },
    fetch: async (a) => {
        const forceUpdate = a.includes('--update');
        if (a[0] && !a[0].startsWith('--')) {
            await fetchModules(a[0], forceUpdate);
            return;
        }
        const root = findProjectRoot(process.cwd());
        if (!root) throw new Error('no slasm.json found — run: slasm init');
        const json = readSlasmJson(root);
        if (!json.main) throw new Error('no "main" field in slasm.json');
        await fetchModules(path.join(root, json.main), forceUpdate);
    },
    'modules-clear': () => {
        const root = findProjectRoot(process.cwd());
        if (!root) throw new Error('no slasm.json found — run: slasm init');
        clearLocalModules(root);
    },
    'cache-clear': () => {
        const { CACHE_DIR } = require('../tools/fetch.js');
        if (fs.existsSync(CACHE_DIR)) {
            fs.rmSync(CACHE_DIR, { recursive: true, force: true });
            console.log('cache cleared');
        } else {
            console.log('cache is already empty');
        }
    },
    run: (a) => {
        const key = readKey(a);
        const file = a.find(x => !x.startsWith('--') && !x.startsWith('--key'));
        if (file) { run(file, key); return; }
        const root = findProjectRoot(process.cwd());
        if (!root) throw new Error('no slasm.json found — run: slasm init');
        const json = readSlasmJson(root);
        if (!json.main) throw new Error('no "main" field in slasm.json');
        run(path.join(root, json.main), key);
    },
    eval: (a) => { slasm.eval_slasm(a.join(' ')); },
    repl: () => replLoop(),
    parse: (a) => {
        const src = fs.existsSync(a[0])
            ? fs.readFileSync(a[0], { encoding: 'utf-8' })
            : a.join(' ');
        const parsedata = slasm.parse(slasm.tokenize(src));
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
  init [dir] [name]           create slasm.json in directory (default: cwd)
  install [url...]            install modules listed in args into slasm_modules/
                              no args — reinstalls all from slasm.json
                              --update  force re-download
  modules-clear               delete slasm_modules/ and clear modules in slasm.json
  parse <file|code>
  pack <file> [z] [--key[=]<key>]
  unpack <file> [--key[=]<key>]
  encrypt <file.slasmbin|.slasmz> [--key[=]<key>]  (overwrites in-place)
  decrypt <file.slasmbin|.slasmz> [--key[=]<key>]  (overwrites in-place)
  fetch <file> [--update]     download remote imports
                              if slasm.json exists → saves to slasm_modules/ + updates json
                              otherwise → global cache only (~/.slasm/cache)
                              --update  force re-download even if cached
  cache-clear                 delete all cached modules
  decompile <file> [--out] [--key[=]<key>]
  (if --key is omitted where needed, reads from stdin)
  help`);
    }
};

function replLoop(): never {
    while (true) repl();
}

if (!first) replLoop();

(async () => {
    if (first && commands[first]) {
        try {
            await commands[first](args.slice(1));
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
})();
