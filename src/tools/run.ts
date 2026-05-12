import fs       from 'node:fs';
import path     from 'node:path';
import zlib     from 'node:zlib';
import os       from 'node:os';
import crypto   from 'node:crypto';
import readline from 'node:readline';
import slasm    from '../interpreter/index.js';
import { isEncrypted, decrypt } from './encrypt.js';
import { checkMissingModules } from '../interpreter/loader.js';
import { unpackProject, getPackageMeta } from './pkg.js';
import type { SlasmProcess } from '../interpreter/process.js';

const PKG_EXTS = new Set(['.slpkg', '.slpkgz', '.slpkgj']);

function attachStdinInput(proc: SlasmProcess): void {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    proc.on('input', (reply) => {
        rl.question('', (line) => reply(line));
    });
    proc.once('done',  () => rl.close());
    proc.once('error', () => rl.close());
}

function pkgRunDir(pkgPath: string, name: string): string {
    const hash    = crypto.createHash('sha1').update(path.resolve(pkgPath)).digest('hex').slice(0, 8);
    const dirName = `${name}-${hash}`;
    return path.join(os.homedir(), '.slasm', 'run', dirName);
}

async function runPkg(pkgPath: string, key?: string): Promise<void> {
    const meta = getPackageMeta(pkgPath, key);
    if (!meta) throw new Error(key ? 'wrong key or no slasm.json inside package' : 'package is encrypted or slasm.json not found — provide --key');
    if (!meta.main) throw new Error('no "main" field in package slasm.json');

    const name   = (meta.name ?? path.basename(pkgPath, path.extname(pkgPath))).replace(/\s+/g, '-');
    const runDir = pkgRunDir(pkgPath, name);

    fs.mkdirSync(runDir, { recursive: true });
    unpackProject(pkgPath, runDir, key);

    try {
        const mainPath = path.join(runDir, meta.main);
        if (!fs.existsSync(mainPath)) {
            const binPath = mainPath.replace(/\.slasm$/, '.slasmbin');
            if (fs.existsSync(binPath)) {
                await run(binPath);
            } else {
                throw new Error(`main file not found: ${mainPath}`);
            }
        } else {
            await run(mainPath);
        }
    } finally {
        fs.rmSync(runDir, { recursive: true, force: true });
    }
}

export default async function run(filepath: string, key?: string): Promise<void> {
    const p = path.resolve(filepath);
    if (!fs.existsSync(p)) {
        console.log('no such file:', p);
        return;
    }
    const ext = path.extname(p);

    if (PKG_EXTS.has(ext)) {
        await runPkg(p, key);
        return;
    }

    await checkMissingModules(p);

    let proc: SlasmProcess;

    if (ext === '.slasm') {
        proc = slasm.eval_slasm(fs.readFileSync(p, { encoding: 'utf-8' }), p);
    } else if (ext === '.slasmjson') {
        const basedir = path.dirname(p);
        const [instr, labels] = JSON.parse(fs.readFileSync(p, { encoding: 'utf-8' }));
        proc = slasm.evaluate(instr.map(String), labels ?? [], [], [], [], basedir);
    } else if (ext === '.slasmbin' || ext === '.slasmz') {
        const basedir = path.dirname(p);
        let buff = fs.readFileSync(p);
        if (isEncrypted(buff)) {
            if (!key) { console.error('file is encrypted, provide --key'); return; }
            buff = decrypt(buff, key);
        }
        if (ext === '.slasmz') buff = zlib.inflateSync(buff);
        const [instr, labels, , exports, imports] = slasm.SLASMBin.unpack(buff);
        proc = slasm.evaluate(instr.map(String), labels ?? [], [], [], imports ?? [], basedir, exports ?? []);
    } else {
        console.log('unknown extension:', ext);
        return;
    }

    attachStdinInput(proc);
    proc.on('error', (err) => console.error('SLASM Error:', err.message));
    await proc.result;
}
