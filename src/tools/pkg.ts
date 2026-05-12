import fs   from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import AdmZip from 'adm-zip';
import slasm from '../interpreter';
import SLASMBin from './packunpack';
import { findProjectRoot, readSlasmJson, type SlasmJson } from './fetch';
import { encrypt, decrypt, isEncrypted } from './encrypt';

const SLASM_EXTS = new Set(['.slasm', '.slasmbin', '.slasmz', '.slasmjson']);

export type PkgFormat = 'slpkg' | 'slpkgz' | 'slpkgj';

export type PackOptions = {
    keepSources?: boolean;
    dryRun?:      boolean;
    format?:      PkgFormat;
    key?:         string;
};

export type PackEntry = {
    zipPath: string;
    source:  string;
    note:    string;
};

function collectProjectFiles(projectRoot: string): string[] {
    const result: string[] = [];
    const ignored = new Set(['node_modules', 'slasm_modules', '.slasm', 'lib', '.git']);

    function walk(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (ignored.has(entry.name)) continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else {
                result.push(full);
            }
        }
    }

    walk(projectRoot);

    const json = readSlasmJson(projectRoot);
    for (const rel of Object.values(json.modules)) {
        const abs = path.join(projectRoot, rel);
        if (fs.existsSync(abs)) result.push(abs);
    }

    return result;
}

function compileToSlasmbin(filepath: string): Buffer {
    const ext = path.extname(filepath);
    if (ext === '.slasmbin') return fs.readFileSync(filepath);
    if (ext === '.slasmz') {
        const buf = zlib.inflateSync(fs.readFileSync(filepath));
        return buf;
    }
    if (ext === '.slasmjson') {
        const parsed = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
        return SLASMBin.pack(parsed);
    }
    if (ext === '.slasm') {
        const r = slasm.parse(slasm.tokenize(fs.readFileSync(filepath, 'utf-8')));
        return SLASMBin.pack([r.instructions, r.labels, r.comments, r.exports, r.imports]);
    }
    throw new Error(`cannot compile: ${filepath}`);
}

export function buildPackEntries(projectRoot: string, opts: PackOptions = {}): PackEntry[] {
    const files   = collectProjectFiles(projectRoot);
    const entries: PackEntry[] = [];

    for (const abs of files) {
        const rel = path.relative(projectRoot, abs).replace(/\\/g, '/');
        const ext = path.extname(abs);

        if (SLASM_EXTS.has(ext)) {
            if (opts.keepSources) {
                if (ext === '.slasm') {
                    entries.push({ zipPath: rel, source: abs, note: 'source' });
                }
            } else {
                const binRel = rel.replace(/\.(slasm|slasmz|slasmjson)$/, '.slasmbin');
                entries.push({ zipPath: binRel, source: abs, note: `compile → ${binRel}` });
            }
        } else {
            entries.push({ zipPath: rel, source: abs, note: 'copy' });
        }
    }

    return entries;
}

function buildJsonPkg(projectRoot: string, opts: PackOptions): Record<string, string> {
    const entries = buildPackEntries(projectRoot, opts);
    const result: Record<string, string> = {};

    for (const entry of entries) {
        const ext = path.extname(entry.source);
        if (!opts.keepSources && SLASM_EXTS.has(ext)) {
            const bin = compileToSlasmbin(entry.source);
            result[entry.zipPath] = bin.toString('base64');
        } else {
            const isBinary = isBinaryFile(entry.source);
            if (isBinary) {
                result[entry.zipPath] = fs.readFileSync(entry.source).toString('base64');
            } else {
                result[entry.zipPath] = fs.readFileSync(entry.source, 'utf-8');
            }
        }
    }

    return result;
}

function isBinaryFile(filepath: string): boolean {
    const buf = fs.readFileSync(filepath);
    const len = Math.min(buf.length, 512);
    for (let i = 0; i < len; i++) {
        if (buf[i] === 0) return true;
    }
    return false;
}

export function packProject(projectRoot: string, outPath: string, opts: PackOptions = {}): PackEntry[] {
    const entries = buildPackEntries(projectRoot, opts);
    const fmt     = opts.format ?? 'slpkg';

    if (opts.dryRun) return entries;

    if (fmt === 'slpkgj') {
        const json = buildJsonPkg(projectRoot, opts);
        fs.writeFileSync(outPath, JSON.stringify(json, null, 2), 'utf-8');
    } else {
        const zip = new AdmZip();

        for (const entry of entries) {
            const ext = path.extname(entry.source);
            if (!opts.keepSources && SLASM_EXTS.has(ext)) {
                zip.addFile(entry.zipPath, compileToSlasmbin(entry.source));
            } else {
                zip.addFile(entry.zipPath, fs.readFileSync(entry.source));
            }
        }

        let buf = zip.toBuffer();
        if (fmt === 'slpkgz') buf = zlib.deflateSync(buf);
        if (opts.key) buf = encrypt(buf, opts.key);
        fs.writeFileSync(outPath, buf);
    }

    return entries;
}

export function unpackProject(pkgPath: string, outDir: string, key?: string): string[] {
    const ext     = path.extname(pkgPath);
    const written: string[] = [];

    if (ext === '.slpkgj') {
        const json: Record<string, string> = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        for (const [rel, content] of Object.entries(json)) {
            const outFile = path.join(outDir, rel);
            fs.mkdirSync(path.dirname(outFile), { recursive: true });
            const isBin = rel.endsWith('.slasmbin') || (!isTextEntry(rel) && isBase64(content));
            fs.writeFileSync(outFile, isBin ? Buffer.from(content, 'base64') : content, isBin ? undefined : 'utf-8');
            written.push(outFile);
        }
    } else {
        let buf = fs.readFileSync(pkgPath);
        if (isEncrypted(buf)) {
            if (!key) throw new Error('package is encrypted, provide --key');
            buf = decrypt(buf, key);
        }
        if (ext === '.slpkgz') buf = zlib.inflateSync(buf);
        const zip     = new AdmZip(buf);
        const entries = zip.getEntries();
        for (const entry of entries) {
            if (entry.isDirectory) continue;
            const outFile = path.join(outDir, entry.entryName);
            fs.mkdirSync(path.dirname(outFile), { recursive: true });
            fs.writeFileSync(outFile, entry.getData());
            written.push(outFile);
        }
    }

    return written;
}

function isTextEntry(rel: string): boolean {
    const textExts = new Set(['.slasm', '.slasmjson', '.js', '.json', '.txt', '.md', '.csv', '.html', '.css']);
    return textExts.has(path.extname(rel));
}

function isBase64(s: string): boolean {
    return /^[A-Za-z0-9+/]+=*$/.test(s.trim());
}

export function getPackageMeta(pkgPath: string, key?: string): SlasmJson | null {
    const ext = path.extname(pkgPath);
    try {
        if (ext === '.slpkgj') {
            const json: Record<string, string> = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            if (json['slasm.json']) return JSON.parse(json['slasm.json']);
            return null;
        }
        let buf = fs.readFileSync(pkgPath);
        if (isEncrypted(buf)) {
            if (!key) return null;
            buf = decrypt(buf, key);
        }
        if (ext === '.slpkgz') buf = zlib.inflateSync(buf);
        const zip   = new AdmZip(buf);
        const entry = zip.getEntry('slasm.json');
        if (!entry) return null;
        return JSON.parse(entry.getData().toString('utf-8'));
    } catch {
        return null;
    }
}

export function packFromCli(args: string[]): void {
    const keepSources = args.includes('--keep-sources');
    const dryRun      = args.includes('--dry-run');

    let format: PkgFormat = 'slpkg';
    if (args.includes('--z') || args.includes('-z')) format = 'slpkgz';
    if (args.includes('--json') || args.includes('-j')) format = 'slpkgj';

    let key: string | undefined;
    for (const a of args) {
        if (a.startsWith('--key=')) { key = a.slice('--key='.length); break; }
        if (a === '--key') { key = args[args.indexOf(a) + 1]; break; }
    }

    const projectRoot = findProjectRoot(process.cwd());
    if (!projectRoot) throw new Error('no slasm.json found — run: slasm init');

    const json    = readSlasmJson(projectRoot);
    const name    = (json.name ?? path.basename(projectRoot)).replace(/\s+/g, '-');
    const ext     = format === 'slpkgz' ? '.slpkgz' : format === 'slpkgj' ? '.slpkgj' : '.slpkg';
    const outPath = path.join(projectRoot, name + ext);

    const entries = packProject(projectRoot, outPath, { keepSources, dryRun, format, key });

    console.log(dryRun ? 'dry run — files that would be packed:' : `packing → ${outPath}`);
    for (const e of entries) {
        console.log(`  ${e.zipPath}  (${e.note})`);
    }

    if (!dryRun) console.log(`\ndone: ${entries.length} file(s) → ${outPath}`);
}