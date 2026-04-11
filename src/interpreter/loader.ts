import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import tokenize from './tokenize.js';
import parse from './parse.js';
import preprocess from './preprocess.js';
import nodeVm from 'node:vm';
import { createVM, type Runtime, type NativeExport } from './vm.js';
import type { InlineModule } from '../tools/packunpack.js';
import type { ParsedSLASM } from '../tools/packunpack.js';
import SLASMBin from '../tools/packunpack.js';
import { importToUrl, cachedPath, findProjectRoot, collectImports } from '../tools/fetch.js';
import { isEncrypted, decrypt } from '../tools/encrypt.js';

const inflateAsync = promisify(zlib.inflate);

const EXTENSIONS = ['.slasm', '.slasmbin', '.slasmz', '.slasmjson', '.js'];

export async function checkMissingModules(filepath: string): Promise<void> {
    const projectRoot = findProjectRoot(path.dirname(filepath));
    const urls = collectImports(filepath, path.dirname(filepath));
    const missing = [...new Set(urls)].filter(u => !cachedPath(u, projectRoot));
    if (missing.length > 0) {
        const args = missing.join(' ');
        throw new Error(`missing modules, run:\n  slasm install ${args}`);
    }
}

function resolve(filepath: string, basedir: string): string {
    const url = importToUrl(filepath);
    if (url) {
        const projectRoot = findProjectRoot(basedir);
        const cached = cachedPath(url, projectRoot);
        if (!cached) throw new Error(`module '${filepath}' not installed — run: slasm install ${url}`);
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

export async function loadInlineModules(inlineModules: InlineModule[], runtime: Runtime): Promise<void> {
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
        runtime.emitter.emit('module:load', m.namespace, '(inline)');
    }
}

export async function loadModule(filepath: string, namespace: string, runtime: Runtime, basedir: string = '', key?: string): Promise<void> {
    if (runtime.modules.has(namespace)) return;

    const resolved = resolve(filepath, basedir || process.cwd());
    const ext = path.extname(resolved);

    runtime.emitter.emit('module:load', namespace, resolved);

    if (ext === '.js') {
        const mod = require(resolved) as Record<string, NativeExport>;
        const exports = new Map<string, NativeExport>();
        for (const [name, def] of Object.entries(mod)) {
            if (typeof def.fn !== 'function') throw new Error(`native module '${namespace}': export '${name}' missing fn`);
            exports.set(name, { args: def.args ?? 0, returns: def.returns ?? 0, fn: def.fn });
        }
        runtime.nativeModules.set(namespace, exports);
        return;
    }

    if (ext === '.slasm') {
        const code = await fsp.readFile(resolved, { encoding: 'utf-8' });
        const result = parse(tokenize(code));
        const instructions = preprocess(result.instructions);
        runtime.modules.set(namespace, createVM(namespace, instructions, result.labels, [], result.exports));
        return;
    }

    if (ext === '.slasmjson') {
        const raw = await fsp.readFile(resolved, { encoding: 'utf-8' });
        const [instr, lbls]: ParsedSLASM = JSON.parse(raw);
        runtime.modules.set(namespace, createVM(namespace, instr.map(String), lbls));
        return;
    }

    let buff = await fsp.readFile(resolved);

    if (isEncrypted(buff)) {
        if (!key) throw new Error(`module '${filepath}' is encrypted, provide key: ;+path:key:namespace+;`);
        buff = decrypt(buff, key);
    }

    if (ext === '.slasmz') {
        const inflated = await inflateAsync(buff);
        buff = Buffer.from(inflated);
        const [instr, lbls] = SLASMBin.unpack(buff);
        runtime.modules.set(namespace, createVM(namespace, instr.map(String), lbls));
        return;
    }

    const [instr, lbls] = SLASMBin.unpack(buff);
    runtime.modules.set(namespace, createVM(namespace, instr.map(String), lbls));
}
