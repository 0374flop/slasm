import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import os from 'node:os';
import slasm from '../interpreter/index.js';

export const GLOBAL_CACHE_DIR = path.join(os.homedir(), '.slasm', 'cache');
export const CACHE_DIR = GLOBAL_CACHE_DIR;

export const SLASM_JSON  = 'slasm.json';
export const MODULES_DIR = 'slasm_modules';

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

const BUILTIN_LIBS_DIR = path.resolve(__dirname, '../../slasm-libs');

function isBuiltin(name: string): boolean {
    return fs.existsSync(path.join(BUILTIN_LIBS_DIR, name + '.js')) ||
           fs.existsSync(path.join(BUILTIN_LIBS_DIR, name, 'index.js'));
}

async function resolveSrc(src: string, name: string): Promise<string | null> {
    const isUrl   = src.startsWith('https://') || src.startsWith('http://');
    const isLocal = src.startsWith('./') || src.startsWith('../') || path.isAbsolute(src);
    const isGhShorthand = /^[^/]+\/[^/]+(\/.*)?$/.test(src) && !isUrl && !isLocal;

    if (isGhShorthand) {
        const parts = src.split('/');
        const file  = parts.slice(2).join('/') || 'index.js';
        const base  = `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}`;
        try { await fetchUrl(`${base}/main/${file}`, 5000); return `${base}/main/${file}`; }
        catch { return `${base}/master/${file}`; }
    }

    if (!isUrl && !isLocal) {
        process.stdout.write(`  enter URL or path for module '${name}': `);
        const buf = Buffer.alloc(4096);
        const n = fs.readSync(0, buf, 0, buf.length, null);
        const input = buf.slice(0, n).toString().trim();
        if (!input) return null;
        return input;
    }

    return src;
}

async function downloadModule(resolvedSrc: string, name: string, projectRoot: string, forceUpdate: boolean): Promise<string> {
    const isUrl = resolvedSrc.startsWith('https://') || resolvedSrc.startsWith('http://');

    if (isUrl) {
        const srcExt  = path.extname(new URL(resolvedSrc).pathname) || '.js';
        const destExt = srcExt === '.slasm' ? '.slasmbin' : srcExt;
        const localPath = path.join(projectRoot, MODULES_DIR, name + destExt);
        fs.mkdirSync(path.dirname(localPath), { recursive: true });

        if (!forceUpdate && fs.existsSync(localPath)) {
            console.log(`  cached   ${name} (${resolvedSrc})`);
            return localPath;
        }

        const data = await fetchUrl(resolvedSrc);
        const content = srcExt === '.slasm' ? slasm.compile_slasm(data.toString('utf-8')) : data;
        fs.writeFileSync(localPath, content);
        console.log(`  installed ${name} ← ${resolvedSrc}`);
        return localPath;
    } else {
        const abs = path.resolve(resolvedSrc);
        if (!fs.existsSync(abs)) throw new Error(`file not found: ${abs}`);
        const localPath = path.join(projectRoot, MODULES_DIR, name + (path.extname(abs) || '.js'));
        fs.mkdirSync(path.dirname(localPath), { recursive: true });

        if (!forceUpdate && fs.existsSync(localPath)) {
            console.log(`  cached   ${name} (${resolvedSrc})`);
            return localPath;
        }

        fs.copyFileSync(abs, localPath);
        console.log(`  installed ${name} ← ${resolvedSrc}`);
        return localPath;
    }
}

export async function installModules(specs: { name: string; src: string }[], forceUpdate = false): Promise<void> {
    const projectRoot = findProjectRoot(process.cwd());
    if (!projectRoot) throw new Error('no slasm.json found — run: slasm init');

    console.log(`installing ${specs.length} module(s)...`);

    let ok = 0, fail = 0;
    for (const { name, src } of specs) {
        if (isBuiltin(name)) {
            console.log(`  skipped  ${name} — built-in module, no install needed. just use ;+${name}+;`);
            continue;
        }

        try {
            const resolvedSrc = await resolveSrc(src, name);
            if (!resolvedSrc) {
                console.log(`  failed   ${name} — no URL provided`);
                fail++;
                continue;
            }

            const localPath = await downloadModule(resolvedSrc, name, projectRoot, forceUpdate);

            const json = readSlasmJson(projectRoot);
            json.modules[name] = path.relative(projectRoot, localPath).replace(/\\/g, '/');
            writeSlasmJson(projectRoot, json);
            ok++;
        } catch (e) {
            console.error(`  failed   ${name} — ${(e as Error).message}`);
            fail++;
        }
    }

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
