#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initProject, findProjectRoot, readSlasmJson, installModules, clearLocalModules, CACHE_DIR } from "../tools/fetch";

type Command = (args: string[]) => void | Promise<void>;

const helpTexts: Record<string, string> = {
    init: `sl-pm init [dir] [name]

  Creates a slasm.json in the given directory (default: current directory).`,

    install: `sl-pm install <url>:<name> [<url>:<name> ...] [--update]

  Installs a module from a URL, GitHub shorthand, or local path.

  Examples:
    sl-pm install https://example.com/mylib.js:mylib
    sl-pm install ./path/to/lib.js:mylib
    sl-pm install user/repo:mylib
    sl-pm install user/repo/dist/index.js:mylib
    sl-pm install                         (reinstall all from slasm.json)

  --update   force re-download even if already cached`,

    'modules-clear': `sl-pm modules-clear

  Deletes slasm_modules/ and clears the modules list in slasm.json.`,

    'cache-clear': `sl-pm cache-clear [--modules] [--run]

  Clears ~/.slasm/ cache directories.

  --modules   clear only the module cache
  --run       clear only unpacked package cache`,
};

const commands: Record<string, Command> = {
    init: (a) => { initProject(a[0] ?? process.cwd(), a[1]); },
    install: async (a) => {
        const forceUpdate = a.includes('--update');
        const specs = a.filter(x => !x.startsWith('--'));
        if (specs.length === 0) {
            const root = findProjectRoot(process.cwd());
            if (!root) throw new Error('no slasm.json found — run: sl-pm init');
            const json = readSlasmJson(root);
            const entries = Object.entries(json.modules);
            if (entries.length === 0) { console.log('nothing to install'); return; }
            await installModules(entries.map(([name, src]) => ({ name, src })), forceUpdate);
        } else {
            const parsed = specs.map(spec => {
                const colonIdx = spec.lastIndexOf(':');
                if (colonIdx === -1 || colonIdx === 0) throw new Error(`invalid format '${spec}' — expected <url>:<name>`);
                let splitAt = colonIdx;
                if (colonIdx === 1 && /^[a-zA-Z]$/.test(spec[0])) {
                    splitAt = spec.indexOf(':', 2);
                    if (splitAt === -1) throw new Error(`invalid format '${spec}' — expected <url>:<name>`);
                }
                return { src: spec.slice(0, splitAt), name: spec.slice(splitAt + 1) };
            });
            await installModules(parsed, forceUpdate);
        }
    },
    'modules-clear': () => {
        const root = findProjectRoot(process.cwd());
        if (!root) throw new Error('no slasm.json found — run: sl-pm init');
        clearLocalModules(root);
    },
    'cache-clear': (a) => {
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
    help: () => {
        console.log(`sl-pm — slasm package manager

usage:
  sl-pm <command> [args]

commands:
  init           create slasm.json
  install        install modules from slasm.json or URLs
  modules-clear  remove slasm_modules/
  cache-clear    clear global cache`);
    }
};

const args = process.argv.slice(2);
const first = args[0];

(async () => {
    if (!first || first === 'help') { commands.help([]); process.exit(0); }

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

    commands.help([]);
    process.exit(1);
})();
