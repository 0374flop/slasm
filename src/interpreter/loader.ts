import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import tokenize from './tokenize.js';
import parse from './parse.js';
import { createVM, type Runtime } from './vm.js';
import type { ParsedSLASM } from '../tools/packunpack.js';
import SLASMBin from '../tools/packunpack.js';

const EXTENSIONS = ['.slasm', '.slasmbin', '.slasmz', '.slasmjson'];

function resolve(filepath: string, basedir: string): string {
    const p = path.resolve(basedir, filepath);
    if (fs.existsSync(p)) return p;
    for (const ext of EXTENSIONS) {
        const withExt = p + ext;
        if (fs.existsSync(withExt)) return withExt;
    }
    throw new Error(`module not found: ${p}`);
}

export function loadModule(filepath: string, namespace: string, runtime: Runtime, basedir: string = ''): void {
    if (runtime.modules.has(namespace)) return;

    const resolved = resolve(filepath, basedir || process.cwd());
    const ext = path.extname(resolved);
    let instructions: string[];
    let labels: { ip: number; name: string }[];

    if (ext === '.slasm') {
        const code = fs.readFileSync(resolved, { encoding: 'utf-8' });
        const result = parse(tokenize(code));
        instructions = result.instructions;
        labels = result.labels;
    } else if (ext === '.slasmjson') {
        const [instr, lbls]: ParsedSLASM = JSON.parse(fs.readFileSync(resolved, { encoding: 'utf-8' }));
        instructions = instr.map(String);
        labels = lbls;
    } else if (ext === '.slasmbin') {
        const [instr, lbls] = SLASMBin.unpack(fs.readFileSync(resolved));
        instructions = instr.map(String);
        labels = lbls;
    } else {
        const [instr, lbls] = SLASMBin.unpack(zlib.inflateSync(fs.readFileSync(resolved)));
        instructions = instr.map(String);
        labels = lbls;
    }

    runtime.modules.set(namespace, createVM(namespace, instructions, labels));
}
