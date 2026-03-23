import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import tokenize from './tokenize.js';
import parse from './parse.js';
import { createVM, type Runtime, type NativeExport } from './vm.js';
import type { ParsedSLASM } from '../tools/packunpack.js';
import SLASMBin from '../tools/packunpack.js';

const EXTENSIONS = ['.slasm', '.slasmbin', '.slasmz', '.slasmjson', '.js'];

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

    if (ext === '.js') {
        const mod = require(resolved) as Record<string, NativeExport>;
        const exports = new Map<string, NativeExport>();
        for (const [name, def] of Object.entries(mod)) {
            if (typeof def.fn !== 'function') throw new Error(`native module '${namespace}': export '${name}' missing fn`);
            exports.set(name, {
                args:    def.args    ?? 0,
                returns: def.returns ?? 0,
                fn:      def.fn,
            });
        }
        runtime.nativeModules.set(namespace, exports);
        return;
    } else if (ext === '.slasm') {
        const code = fs.readFileSync(resolved, { encoding: 'utf-8' });
        const result = parse(tokenize(code));
        instructions = result.instructions;
        labels = result.labels;
        runtime.modules.set(namespace, createVM(namespace, instructions, labels, [], result.exports));
    } else if (ext === '.slasmjson') {
        const [instr, lbls]: ParsedSLASM = JSON.parse(fs.readFileSync(resolved, { encoding: 'utf-8' }));
        instructions = instr.map(String);
        labels = lbls;
        runtime.modules.set(namespace, createVM(namespace, instructions, labels));
    } else if (ext === '.slasmbin') {
        const [instr, lbls] = SLASMBin.unpack(fs.readFileSync(resolved));
        instructions = instr.map(String);
        labels = lbls;
        runtime.modules.set(namespace, createVM(namespace, instructions, labels));
    } else {
        const [instr, lbls] = SLASMBin.unpack(zlib.inflateSync(fs.readFileSync(resolved)));
        instructions = instr.map(String);
        labels = lbls;
        runtime.modules.set(namespace, createVM(namespace, instructions, labels));
    }
}
