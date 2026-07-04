#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import slasm from "../interpreter";
import { encryptFile, decryptFile } from "../tools/encrypt";
import { packFromCli } from "../tools/pkg";
import { decompileFile } from "../tools/decompiler";
import convert, { packSingleFile } from "../tools/convert";

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
    pack: `sl-pkg pack [file] [--z] [--json] [--keep-sources] [--dry-run] [--key[=]<key>]

  Without a file: packs the current project into a .slpkg file.
  With a file: compiles it to a single .slasmbin.

  --z              compress output
  --json           output as JSON
  --keep-sources   include original .slasm files
  --dry-run        show what would be packed without writing
  --key=<key>      encrypt the output`,

    unpack: `sl-pkg unpack <file> [--key[=]<key>]

  Unpacks a binary file to .slasmjson.`,

    convert: `sl-pkg convert <file> <format> [--z] [--json] [--key[=]<key>]

  Converts between formats: slasm, slasmjson, slasmbin, slasmz.
  Can also pack a single file into a package:
    slpkg   → .slpkg  (zip-based)
    slpkgz  → .slpkgz (compressed)
    slpkgj  → .slpkgj (json-based)

  --key=<key>  encryption key (only for package output)`,

    encrypt: `sl-pkg encrypt <file> --key[=]<key>

  Encrypts a .slasmbin or .slasmz file in-place using AES-256-GCM.`,

    decrypt: `sl-pkg decrypt <file> --key[=]<key>

  Decrypts an encrypted binary file in-place.`,

    decompile: `sl-pkg decompile <file> [--out] [--dry-run] [--key[=]<key>]

  Decompiles a binary or package back to readable .slasm source.

  Single files (.slasmbin, .slasmz, .slasmjson):
    by default prints result to stdout.
    with --out: saves result next to the original file as <file>.decompiled.slasm.

  Packages (.slpkg, .slpkgz, .slpkgj):
    decompiles all files inside and saves them into a new <name>.decompiled/ folder.

  --out        save to file instead of printing to stdout (single files only)
  --dry-run    show what would be decompiled without writing any files
  --key=<key>  decryption key for encrypted files`,
};

const commands: Record<string, Command> = {
    pack: async (a) => {
        const file = a.find(x => !x.startsWith('-'));
        if (file && (file.endsWith('.slasm') || file.endsWith('.slasmbin') || file.endsWith('.slasmz') || file.endsWith('.slasmjson'))) {
            console.log(slasm.SLASMBin.packFile(file, a.includes('--z'), readKey(a)));
        } else {
            await packFromCli(a);
        }
    },
    unpack: (a) => {
        const file = a.find(x => !x.startsWith('-'));
        if (!file) throw new Error('usage: sl-pkg unpack <file>');
        console.log(convert(file, 'slasmjson', readKey(a)));
    },
    convert: async (a) => {
        if (!a[0] || !a[1]) throw new Error('usage: sl-pkg convert <file> <format>');
        const PKG_FORMATS = new Set(['slpkg', 'slpkgz', 'slpkgj']);
        if (PKG_FORMATS.has(a[1])) {
            console.log(await packSingleFile(a[0], a[1] as 'slpkg' | 'slpkgz' | 'slpkgj', readKey(a)));
        } else {
            console.log(convert(a[0], a[1], readKey(a)));
        }
    },
    encrypt: (a) => console.log(encryptFile(a[0], requireKey(a))),
    decrypt: (a) => console.log(decryptFile(a[0], requireKey(a))),
    decompile: async (a) => {
        const file = a.find(x => !x.startsWith('-'));
        if (!file) throw new Error('usage: sl-pkg decompile <file>');
        const ext = path.extname(file);
        const isPkg = ext === '.slpkg' || ext === '.slpkgz' || ext === '.slpkgj';
        const dryRun = a.includes('--dry-run');

        if (dryRun) {
            if (isPkg) {
                console.log(`would decompile package: ${file}`);
                console.log(`output folder: ${path.join(path.dirname(file), path.basename(file, ext) + '.decompiled')}`);
            } else {
                if (a.includes('--out')) {
                    const p = path.normalize(file);
                    console.log(`would write: ${path.join(path.dirname(p), path.basename(p, ext) + '.decompiled.slasm')}`);
                } else {
                    console.log(`would print to stdout: ${file}`);
                }
            }
            return;
        }

        const result = await decompileFile(file, readKey(a));
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
        console.log(`sl-pkg — slasm packager

usage:
  sl-pkg <command> [args]

commands:
  pack         compile project or single file into a package
  unpack       convert binary to .slasmjson
  convert      convert between formats
  encrypt      encrypt a binary file in-place
  decrypt      decrypt an encrypted binary file in-place
  decompile    decompile binary back to .slasm source`);
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
