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

export async function installModules(specs: { name: string; src: string }[], forceUpdate = false): Promise<void> {
    const projectRoot = findProjectRoot(process.cwd());
    if (!projectRoot) throw new Error('no slasm.json found — run: slasm init');

    console.log(`installing ${specs.length} module(s)...`);

    let ok = 0, fail = 0;
    for (const { name, src } of specs) {
        try {
            let localPath: string;

            if (src.startsWith('https://') || src.startsWith('http://')) {
                const ext  = path.extname(new URL(src).pathname) || '.js';
                const rel  = path.join(MODULES_DIR, name + ext).replace(/\\/g, '/');
                localPath  = path.join(projectRoot, rel);
                fs.mkdirSync(path.dirname(localPath), { recursive: true });

                if (!forceUpdate && fs.existsSync(localPath)) {
                    console.log(`  cached   ${name} (${src})`);
                } else {
                    const data = await fetchUrl(src);
                    fs.writeFileSync(localPath, data);
                    console.log(`  installed ${name} ← ${src}`);
                }
            } else {
                const abs = path.resolve(src);
                if (!fs.existsSync(abs)) throw new Error(`file not found: ${abs}`);
                const ext = path.extname(abs) || '.js';
                const rel = path.join(MODULES_DIR, name + ext).replace(/\\/g, '/');
                localPath = path.join(projectRoot, rel);
                fs.mkdirSync(path.dirname(localPath), { recursive: true });
                if (!forceUpdate && fs.existsSync(localPath)) {
                    console.log(`  cached   ${name} (${src})`);
                } else {
                    fs.copyFileSync(abs, localPath);
                    console.log(`  installed ${name} ← ${src}`);
                }
            }

            const data = readSlasmJson(projectRoot);
            data.modules[name] = path.relative(projectRoot, localPath).replace(/\\/g, '/');
            writeSlasmJson(projectRoot, data);
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
