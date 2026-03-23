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

export const SLASM_LIBS_BASE = 'https://raw.githubusercontent.com/0374flop/slasm-libs/main';
export const CACHE_DIR = path.join(os.homedir(), '.slasm', 'cache');

const EXTENSIONS = ['.slasm', '.slasmbin', '.slasmz', '.slasmjson', '.js'];

export function urlToCache(url: string): string {
    const hash = crypto.createHash('sha1').update(url).digest('hex');
    const ext  = path.extname(new URL(url).pathname) || '.js';
    return path.join(CACHE_DIR, hash + ext);
}

export function importToUrl(imp: string): string | null {
    if (imp.startsWith('https://') || imp.startsWith('http://')) return imp;
    const m = imp.match(/^slasm\.(.+)$/);
    if (m) return `${SLASM_LIBS_BASE}/${m[1]}/index.js`;
    return null;
}

export function cachedPath(url: string): string | null {
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

async function downloadUrl(url: string, forceUpdate: boolean): Promise<string> {
    const cachePath = urlToCache(url);
    if (!forceUpdate && fs.existsSync(cachePath)) return cachePath;
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const data = await fetchUrl(url);
    fs.writeFileSync(cachePath + '.tmp', data);
    fs.renameSync(cachePath + '.tmp', cachePath);
    return cachePath;
}

function collectImports(filepath: string, basedir: string, seen = new Set<string>()): string[] {
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

    const unique = [...new Set(urls)];
    console.log(`fetching ${unique.length} module(s)...`);

    let ok = 0, fail = 0;
    await Promise.all(unique.map(async (url) => {
        const short = url.replace('https://raw.githubusercontent.com/0374flop/slasm-libs/main/', 'slasm:');
        try {
            const cached = !forceUpdate && fs.existsSync(urlToCache(url));
            if (cached) {
                console.log(`  cached  ${short}`);
            } else {
                await downloadUrl(url, forceUpdate);
                console.log(`  fetched ${short}`);
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
