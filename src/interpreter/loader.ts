import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import tokenize from './tokenize.js';
import parse from './parse.js';
import preprocess from './preprocess.js';
import { createVM, type Runtime, type NativeExport } from './vm.js';
import type { ParsedSLASM } from '../tools/packunpack.js';
import SLASMBin from '../tools/packunpack.js';
import { findProjectRoot, readSlasmJson, MODULES_DIR } from '../tools/fetch.js';
import { isEncrypted, decrypt } from '../tools/encrypt.js';

const inflateAsync = promisify(zlib.inflate);

const EXTENSIONS = ['.slasm', '.slasmbin', '.slasmz', '.slasmjson', '.js'];

// built-in libs shipped with the slasm package
const BUILTIN_LIBS_DIR = path.resolve(__dirname, '../../slasm-libs');

function isSimpleName(s: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(s) && !s.startsWith('.');
}

function resolveBuiltin(name: string): string | null {
    const candidates = [
        path.join(BUILTIN_LIBS_DIR, name + '.js'),
        path.join(BUILTIN_LIBS_DIR, name, 'index.js'),
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return null;
}

function resolveFromProject(name: string, projectRoot: string): string | null {
    const data = readSlasmJson(projectRoot);
    const rel  = data.modules[name];
    if (!rel) return null;
    const abs = path.join(projectRoot, rel);
    return fs.existsSync(abs) ? abs : null;
}

function resolve(filepath: string, basedir: string): string {
    // simple name like "str", "arr" — resolve via builtins or slasm.json
    if (isSimpleName(filepath)) {
        const builtin = resolveBuiltin(filepath);
        if (builtin) return builtin;

        const projectRoot = findProjectRoot(basedir);
        if (projectRoot) {
            const fromProject = resolveFromProject(filepath, projectRoot);
            if (fromProject) return fromProject;
        }

        throw new Error(`module '${filepath}' not found — is it installed? run: slasm install <url>:${filepath}`);
    }

    // local path (./foo.js, ../bar.slasm, etc.)
    const p = path.resolve(basedir, filepath);
    if (fs.existsSync(p)) return p;
    for (const ext of EXTENSIONS) {
        const withExt = p + ext;
        if (fs.existsSync(withExt)) return withExt;
    }
    throw new Error(`module not found: ${p}`);
}

export async function checkMissingModules(filepath: string): Promise<void> {
    // with the new system, missing modules are caught at load time
    // this function is kept for compatibility but does nothing
}

export async function loadModule(filepath: string, namespace: string, runtime: Runtime, basedir: string = '', key?: string): Promise<void> {
    if (runtime.modules.has(namespace) || runtime.nativeModules.has(namespace)) return;

    const resolved = resolve(filepath, basedir || process.cwd());
    const ext = path.extname(resolved);

    runtime.emitter.emit('module:load', namespace, resolved);

    if (ext === '.js') {
        const mod = require(path.resolve(resolved)) as Record<string, NativeExport>;
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
