#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import slasm from "../interpreter";
import repl from "./repl";
import type { SlasmProcess } from "../interpreter/process";
import run from "../tools/run";
import { decompileFile } from "../tools/decompiler";
import prettyParse from "./prettyparse";
import { encryptFile, decryptFile } from "../tools/encrypt";
import fetchModules, { initProject, findProjectRoot, readSlasmJson, installModules, clearLocalModules } from "../tools/fetch";
import { packFromCli } from "../tools/pkg";
import convert from "../tools/convert";

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

const helpTexts: Record<string, string> = {
    run: `slasm run [file] [--key[=]<key>]

  Runs a .slasm, .slasmbin, .slasmz, .slasmjson, .slpkg, .slpkgz, or .slpkgj file.
  If no file given and slasm.json exists in cwd, runs the main file from it.
  .slpkg files are unpacked to ~/.slasm/run/<name>-<hash>/ and run from there.

  --key=<key>   decryption key for encrypted binaries`,

    eval: `slasm eval <code>

  Evaluates a snippet of SLASM code directly from the command line.`,

    repl: `slasm repl

  Starts an interactive SLASM REPL.`,

    init: `slasm init [dir] [name]

  Creates a slasm.json in the given directory (default: current directory).
  Sets the project name and a default main entry point of main.slasm.`,

    install: `slasm install [url...] [--update]

  Installs remote modules into slasm_modules/.
  With no args, reinstalls all modules listed in slasm.json.

  --update   force re-download even if already cached`,

    fetch: `slasm fetch [file] [--update]

  Downloads remote imports used by a file.
  If slasm.json exists, saves to slasm_modules/ and updates slasm.json.
  Otherwise saves to global cache (~/.slasm/cache).

  --update   force re-download even if already cached`,

    'modules-clear': `slasm modules-clear

  Deletes slasm_modules/ and clears the modules list in slasm.json.`,

    'cache-clear': `slasm cache-clear [--modules] [--run]

  Clears ~/.slasm/ cache directories.
  With no flags: clears everything (~/.slasm/cache and ~/.slasm/run).

  --modules   clear only the module cache (~/.slasm/cache)
  --run       clear only unpacked package cache (~/.slasm/run)`,

    parse: `slasm parse <file|code>

  Parses a .slasm file or inline code and prints the instruction list with labels.`,

    pack: `slasm pack [file] [--z] [--json] [--keep-sources] [--dry-run] [--key[=]<key>]

  Without a file: packs the current project (requires slasm.json) into a .slpkg file.
    All .slasm files are compiled to .slasmbin before packing.
    Output: <name>.slpkg next to slasm.json.

  With a .slasm/.slasmbin/.slasmz/.slasmjson file: compiles it to a single .slasmbin.

  --z              compress output with zlib (.slpkgz or .slasmz)
  --json           output as JSON (.slpkgj or .slasmjson)
  --keep-sources   include original .slasm source files instead of compiling them
  --dry-run        show what would be packed without writing anything
  --key=<key>      encrypt the output (single file only)`,

    convert: `slasm convert <file> <format> [--key[=]<key>]

  Converts a SLASM file to another format.

  Supported formats: slasm, slasmjson, slasmbin, slasmz

  Examples:
    slasm convert main.slasm slasmbin
    slasm convert main.slasmbin slasm
    slasm convert main.slasmz slasmjson`,

    unpack: `slasm unpack <file> [--key[=]<key>]

  Unpacks a .slasmbin or .slasmz file to .slasmjson.

  --key=<key>   decryption key for encrypted binaries`,

    encrypt: `slasm encrypt <file> --key[=]<key>

  Encrypts a .slasmbin or .slasmz file in-place using AES-256-GCM.
  If --key is omitted, reads from stdin.`,

    decrypt: `slasm decrypt <file> --key[=]<key>

  Decrypts an encrypted .slasmbin or .slasmz file in-place.
  If --key is omitted, reads from stdin.`,

    decompile: `slasm decompile <file> [--out] [--key[=]<key>]

  Decompiles a binary file back to readable .slasm source.

  Supported: .slasmbin, .slasmz, .slasmjson, .slpkg, .slpkgz, .slpkgj

  For single files: prints to stdout, or writes to .decompiled.slasm with --out.
  For packages (.slpkg etc): unpacks and decompiles all modules into <name>.decompiled/ folder.

  --out        write output to file instead of stdout (single files only)
  --key=<key>  decryption key for encrypted binaries`,
};

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
    'cache-clear': (a) => {
        const { CACHE_DIR } = require('../tools/fetch.js');
        const runDir = path.join(os.homedir(), '.slasm', 'run');
        const doModules = a.includes('--modules') || (!a.includes('--modules') && !a.includes('--run'));
        const doRun     = a.includes('--run')     || (!a.includes('--modules') && !a.includes('--run'));
        if (doModules) {
            if (fs.existsSync(CACHE_DIR)) { fs.rmSync(CACHE_DIR, { recursive: true, force: true }); console.log('cleared ~/.slasm/cache'); }
            else console.log('~/.slasm/cache is already empty');
        }
        if (doRun) {
            if (fs.existsSync(runDir)) { fs.rmSync(runDir, { recursive: true, force: true }); console.log('cleared ~/.slasm/run'); }
            else console.log('~/.slasm/run is already empty');
        }
    },
    run: async (a) => {
        const key = readKey(a);
        const file = a.find(x => !x.startsWith('--') && !x.startsWith('--key'));
        if (file) { await run(file, key); return; }
        const root = findProjectRoot(process.cwd());
        if (!root) throw new Error('no slasm.json found — run: slasm init');
        const json = readSlasmJson(root);
        if (!json.main) throw new Error('no "main" field in slasm.json');
        await run(path.join(root, json.main), key);
    },
    eval: async (a) => {
        const proc = slasm.eval_slasm(a.join(' '));
        proc.on('input', (reply) => {
            const buf = Buffer.alloc(1024);
            const n = require('node:fs').readSync(0, buf, 0, buf.length, null);
            reply(buf.slice(0, n).toString().replace(/\r?\n$/, ''));
        });
        await proc.result;
    },
    repl: () => replLoop(),
    parse: (a) => {
        const src = fs.existsSync(a[0])
            ? fs.readFileSync(a[0], { encoding: 'utf-8' })
            : a.join(' ');
        const parsedata = slasm.parse(slasm.tokenize(src));
        console.log(prettyParse(parsedata.instructions, parsedata.labels, parsedata.comments));
    },
    pack: (a) => {
        const file = a.find(x => !x.startsWith('-'));
        if (file && (file.endsWith('.slasm') || file.endsWith('.slasmbin') || file.endsWith('.slasmz') || file.endsWith('.slasmjson'))) {
            console.log(slasm.SLASMBin.packFile(file, a.includes('z') || a.includes('--z'), readKey(a)));
        } else {
            packFromCli(a);
        }
    },
    convert: (a) => {
        if (!a[0] || !a[1]) throw new Error('usage: slasm convert <file> <format>');
        console.log(convert(a[0], a[1], readKey(a)));
    },
    unpack: (a) => {
        const key = readKey(a);
        const file = a.find(x => !x.startsWith('-'));
        if (!file) throw new Error('usage: slasm unpack <file>');
        const result = convert(file, 'slasmjson', key);
        console.log(result);
    },
    encrypt: (a) => console.log(encryptFile(a[0], requireKey(a))),
    decrypt: (a) => console.log(decryptFile(a[0], requireKey(a))),
    decompile: (a) => {
        const file = a.find(x => !x.startsWith('-'));
        if (!file) throw new Error('usage: slasm decompile <file>');
        const ext = path.extname(file);
        const isPkg = ext === '.slpkg' || ext === '.slpkgz' || ext === '.slpkgj';
        const result = decompileFile(file, readKey(a));
        if (isPkg) {
            console.log(result);
        } else if (a.includes('--out')) {
            const p = path.normalize(file);
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
  slasm <command> [args] [-h]

commands:
  run          run a .slasm / .slasmbin / .slasmz / .slasmjson / .slpkg file
  eval         evaluate inline SLASM code
  repl         interactive REPL
  init         create slasm.json
  install      install modules from slasm.json or URLs
  fetch        download remote imports
  modules-clear  remove slasm_modules/
  cache-clear  clear global module cache
  parse        parse and print instruction list
  pack         compile project or single file into a package
  unpack       convert binary to .slasmjson
  convert      convert between .slasm .slasmjson .slasmbin .slasmz
  encrypt      encrypt a binary file in-place
  decrypt      decrypt an encrypted binary file in-place
  decompile    decompile binary back to .slasm source

run any command with -h for detailed help:
  slasm pack -h
  slasm convert -h
  ...`);
    }
};

async function replLoop(): Promise<never> {
    await repl();
    process.exit(0);
}

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
        (async () => {
            try {
                await run(first);
                process.exit(0);
            } catch (e) {
                console.error(e instanceof Error ? e.message : e);
                process.exit(1);
            }
        })();
        return;
    }

    commands.help([]);
    process.exit(1);
})();
