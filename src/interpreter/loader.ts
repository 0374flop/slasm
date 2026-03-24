import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import tokenize from './tokenize.js';
import parse from './parse.js';
import nodeVm from 'node:vm';
import { createVM, type Runtime, type NativeExport } from './vm.js';
import type { InlineModule } from '../tools/packunpack.js';
import type { ParsedSLASM } from '../tools/packunpack.js';
import SLASMBin from '../tools/packunpack.js';
import { importToUrl, cachedPath } from '../tools/fetch.js';
import { isEncrypted, decrypt } from '../tools/encrypt.js';

const EXTENSIONS = ['.slasm', '.slasmbin', '.slasmz', '.slasmjson', '.js'];

function resolve(filepath: string, basedir: string): string {
    const url = importToUrl(filepath);
    if (url) {
        const cached = cachedPath(url);
        if (!cached) throw new Error(`module '${filepath}' not cached — run: slasm fetch <file>`);
        return cached;
    }
    const p = path.resolve(basedir, filepath);
    if (fs.existsSync(p)) return p;
    for (const ext of EXTENSIONS) {
        const withExt = p + ext;
        if (fs.existsSync(withExt)) return withExt;
    }
    throw new Error(`module not found: ${p}`);
}

export function loadInlineModules(inlineModules: InlineModule[], runtime: Runtime): void {
    for (const m of inlineModules) {
        if (runtime.modules.has(m.namespace) || runtime.nativeModules.has(m.namespace)) continue;
        if (m.type === 'slasm') {
            runtime.modules.set(m.namespace, createVM(m.namespace, m.instructions.map(String), m.labels, [], m.exports));
        } else {
            const context = { module: { exports: {} as Record<string, NativeExport> }, require };
            nodeVm.runInNewContext(m.source, context);
            const exports = new Map<string, NativeExport>();
            for (const [name, def] of Object.entries(context.module.exports)) {
                if (typeof def.fn !== 'function') throw new Error(`inline native module '${m.namespace}': export '${name}' missing fn`);
                exports.set(name, { args: def.args ?? 0, returns: def.returns ?? 0, fn: def.fn });
            }
            runtime.nativeModules.set(m.namespace, exports);
        }
    }
}

export function loadModule(filepath: string, namespace: string, runtime: Runtime, basedir: string = '', key?: string): void {
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
        let raw = fs.readFileSync(resolved);
        if (isEncrypted(raw)) {
            if (!key) throw new Error(`module '${filepath}' is encrypted, provide key: ;+path:key:namespace+;`);
            raw = decrypt(raw, key);
        }
        const [instr, lbls] = SLASMBin.unpack(raw);
        instructions = instr.map(String);
        labels = lbls;
        runtime.modules.set(namespace, createVM(namespace, instructions, labels));
    } else {
        let raw = fs.readFileSync(resolved);
        if (isEncrypted(raw)) {
            if (!key) throw new Error(`module '${filepath}' is encrypted, provide key: ;+path:key:namespace+;`);
            raw = decrypt(raw, key);
        }
        const [instr, lbls] = SLASMBin.unpack(zlib.inflateSync(raw));
        instructions = instr.map(String);
        labels = lbls;
        runtime.modules.set(namespace, createVM(namespace, instructions, labels));
    }
}
