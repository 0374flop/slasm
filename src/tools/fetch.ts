import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import https from 'node:https';
import http from 'node:http';
import os from 'node:os';
import crypto from 'node:crypto';
import tokenize from '../interpreter/tokenize.js';
import parse from '../interpreter/parse.js';
import SLASMBin from './packunpack.js';

export const SLASM_LIBS_BASE = 'https://raw.githubusercontent.com/0374flop/slasm/refs/heads/master/slasm-libs';
export const GLOBAL_CACHE_DIR = path.join(os.homedir(), '.slasm', 'cache');
export const CACHE_DIR = GLOBAL_CACHE_DIR;

export const SLASM_JSON  = 'slasm.json';
export const MODULES_DIR = 'slasm_modules';

const EXTENSIONS = ['.slasm', '.slasmbin', '.slasmz', '.slasmjson', '.js'];

export interface SlasmJson {
    name?: string;
    main?: string;
    modules: Record<string, string>;
}

export function findProjectRoot(from: string): string | null {
    let dir = path.resolve(from);
    while (true) {
        if (fs.existsSync(path.join(dir, SLASM_JSON))) return dir;
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

export function readSlasmJson(root: string): SlasmJson {
    const p = path.join(root, SLASM_JSON);
    if (!fs.existsSync(p)) return { modules: {} };
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
    catch { return { modules: {} }; }
}

export function writeSlasmJson(root: string, data: SlasmJson): void {
    fs.writeFileSync(path.join(root, SLASM_JSON), JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export function initProject(dir: string, name?: string): void {
    const jsonPath = path.join(dir, SLASM_JSON);
    if (fs.existsSync(jsonPath)) {
        console.log('slasm.json already exists');
        return;
    }
    const data: SlasmJson = {
        name: name ?? path.basename(dir),
        main: 'main.slasm',
        modules: {},
    };
    fs.mkdirSync(dir, { recursive: true });
    writeSlasmJson(dir, data);
    console.log(`initialised slasm project: ${path.resolve(dir)}`);
    console.log(`  created ${SLASM_JSON}`);
}

export function urlToCache(url: string): string {
    const hash = crypto.createHash('sha1').update(url).digest('hex');
    const ext  = path.extname(new URL(url).pathname) || '.js';
    return path.join(GLOBAL_CACHE_DIR, hash + ext);
}

export function importToUrl(imp: string): string | null {
    if (imp.startsWith('https://') || imp.startsWith('http://')) return imp;
    const m = imp.match(/^slasm\.(.+)$/);
    if (m) {
        const name = m[1];
        const hasExt = /\.[a-z]+$/.test(name);
        return hasExt ? `${SLASM_LIBS_BASE}/${name}` : `${SLASM_LIBS_BASE}/${name}/index.js`;
    }
    return null;
}

export function cachedPath(url: string, projectRoot?: string | null): string | null {
    const root = projectRoot ?? findProjectRoot(process.cwd());
    if (root) {
        const data = readSlasmJson(root);
        const rel  = data.modules[url];
        if (rel) {
            const abs = path.join(root, rel);
            if (fs.existsSync(abs)) return abs;
        }
        const globalPath = urlToCache(url);
        if (fs.existsSync(globalPath)) {
            const ext  = path.extname(new URL(url).pathname) || '.js';
            const hash = crypto.createHash('sha1').update(url).digest('hex');
            const rel2 = path.join(MODULES_DIR, hash + ext).replace(/\\/g, '/');
            const abs2 = path.join(root, rel2);
            fs.mkdirSync(path.dirname(abs2), { recursive: true });
            fs.copyFileSync(globalPath, abs2);
            const data2 = readSlasmJson(root);
            data2.modules[url] = rel2;
            writeSlasmJson(root, data2);
            return abs2;
        }
    }
    const p = urlToCache(url);
    return fs.existsSync(p) ? p : null;
}

async function fetchUrl(url: string, timeoutMs = 10000): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, { timeout: timeoutMs }, (res) => {
            if ((res.statusCode ?? 0) >= 300 && (res.statusCode ?? 0) < 400 && res.headers.location) {
                fetchUrl(res.headers.location, timeoutMs).then(resolve).catch(reject);
                return;
            }
            if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
                reject(new Error(`HTTP ${res.statusCode}: ${url}`));
                return;
            }
            const chunks: Buffer[] = [];
            res.on('data', (d: Buffer) => chunks.push(d));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error(`timeout: ${url}`)); });
    });
}

async function downloadUrl(url: string, forceUpdate: boolean, projectRoot?: string | null): Promise<string> {
    const root = projectRoot ?? null;
    let localPath: string | null = null;

    if (root) {
        const data = readSlasmJson(root);
        if (!forceUpdate && data.modules[url]) {
            const abs = path.join(root, data.modules[url]);
            if (fs.existsSync(abs)) return abs;
        }
        const ext  = path.extname(new URL(url).pathname) || '.js';
        const hash = crypto.createHash('sha1').update(url).digest('hex');
        const rel  = path.join(MODULES_DIR, hash + ext);
        localPath  = path.join(root, rel);
        fs.mkdirSync(path.dirname(localPath), { recursive: true });

        const data2 = readSlasmJson(root);
        data2.modules[url] = rel.replace(/\\/g, '/');
        writeSlasmJson(root, data2);
    }

    const cachePath = urlToCache(url);
    if (!forceUpdate && !localPath && fs.existsSync(cachePath)) return cachePath;

    fs.mkdirSync(GLOBAL_CACHE_DIR, { recursive: true });
    const data = await fetchUrl(url);

    fs.writeFileSync(cachePath + '.tmp', data);
    fs.renameSync(cachePath + '.tmp', cachePath);

    if (localPath) {
        fs.writeFileSync(localPath, data);
    }

    return localPath ?? cachePath;
}

export function collectImports(filepath: string, basedir: string, seen = new Set<string>()): string[] {
    const abs = path.resolve(basedir, filepath);
    if (seen.has(abs)) return [];
    seen.add(abs);

    const ext = path.extname(abs);
    let imports: { path: string }[] = [];

    try {
        if (ext === '.slasm') {
            const result = parse(tokenize(fs.readFileSync(abs, 'utf-8')));
            imports = result.imports;
        } else if (ext === '.slasmjson') {
            const parsed = JSON.parse(fs.readFileSync(abs, 'utf-8'));
            imports = (parsed[4] ?? []) as { path: string }[];
        } else if (ext === '.slasmbin' || ext === '.slasmz') {
            let buf = fs.readFileSync(abs);
            if (ext === '.slasmz') buf = zlib.inflateSync(buf);
            const [, , , , imps] = SLASMBin.unpack(buf);
            imports = imps ?? [];
        }
    } catch { return []; }

    const result: string[] = [];
    for (const imp of imports) {
        const url = importToUrl(imp.path);
        if (url) {
            result.push(url);
        } else {
            const localBase = path.dirname(abs);
            let resolved = '';
            const p = path.resolve(localBase, imp.path);
            if (fs.existsSync(p)) resolved = p;
            else for (const e of EXTENSIONS) {
                const w = p + e;
                if (fs.existsSync(w)) { resolved = w; break; }
            }
            if (resolved) result.push(...collectImports(resolved, localBase, seen));
        }
    }
    return result;
}

export default async function fetchModules(filepath: string, forceUpdate = false): Promise<void> {
    const abs  = path.resolve(filepath);
    const urls = collectImports(abs, path.dirname(abs));

    if (urls.length === 0) {
        console.log('no remote imports found');
        return;
    }

    const projectRoot = findProjectRoot(path.dirname(abs));
    if (projectRoot) {
        console.log(`project root: ${projectRoot}`);
    }

    const unique = [...new Set(urls)];
    console.log(`fetching ${unique.length} module(s)...`);

    let ok = 0, fail = 0;
    await Promise.all(unique.map(async (url) => {
        const short = url.replace('https://raw.githubusercontent.com/0374flop/slasm/refs/heads/master/slasm-libs/', 'slasm:');
        try {
            const existing = !forceUpdate && cachedPath(url, projectRoot);
            if (existing) {
                const isLocal = projectRoot && existing.startsWith(projectRoot);
                console.log(`  cached  ${short}${isLocal ? ' (local)' : ''}`);
            } else {
                await downloadUrl(url, forceUpdate, projectRoot);
                const isLocal = !!projectRoot;
                console.log(`  fetched ${short}${isLocal ? ' → slasm_modules/' : ''}`);
            }
            ok++;
        } catch (e) {
            console.error(`  failed  ${short} — ${(e as Error).message}`);
            fail++;
        }
    }));

    console.log(`\ndone: ${ok} ok, ${fail} failed`);
    if (fail > 0) process.exit(1);
}

export async function installModules(urls: string[], forceUpdate = false): Promise<void> {
    const projectRoot = findProjectRoot(process.cwd());
    const unique = [...new Set(urls)];
    console.log(`installing ${unique.length} module(s)...`);
    if (projectRoot) console.log(`project root: ${projectRoot}`);

    let ok = 0, fail = 0;
    await Promise.all(unique.map(async (url) => {
        const short = url.replace('https://raw.githubusercontent.com/0374flop/slasm/refs/heads/master/slasm-libs/', 'slasm:');
        try {
            await downloadUrl(url, forceUpdate, projectRoot);
            console.log(`  installed ${short}`);
            ok++;
        } catch (e) {
            console.error(`  failed  ${short} — ${(e as Error).message}`);
            fail++;
        }
    }));

    console.log(`\ndone: ${ok} ok, ${fail} failed`);
    if (fail > 0) process.exit(1);
}

export function clearLocalModules(projectRoot: string): void {
    const modulesDir = path.join(projectRoot, MODULES_DIR);
    if (fs.existsSync(modulesDir)) {
        fs.rmSync(modulesDir, { recursive: true, force: true });
    }
    const data = readSlasmJson(projectRoot);
    data.modules = {};
    writeSlasmJson(projectRoot, data);
    console.log('local modules cleared');
}
