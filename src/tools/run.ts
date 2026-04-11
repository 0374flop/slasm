import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import slasm from '../interpreter/index.js';
import { isEncrypted, decrypt } from './encrypt.js';
import { checkMissingModules } from '../interpreter/loader.js';
import type { SlasmProcess } from '../interpreter/process.js';

function attachStdinInput(proc: SlasmProcess): void {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    proc.on('input', (reply) => {
        rl.question('', (line) => reply(line));
    });
    proc.once('done',  () => rl.close());
    proc.once('error', () => rl.close());
}

export default async function run(filepath: string, key?: string): Promise<void> {
    const p = path.resolve(filepath);
    if (!fs.existsSync(p)) {
        console.log('no such file:', p);
        return;
    }
    const ext = path.extname(p);
    await checkMissingModules(p);

    let proc: SlasmProcess;

    if (ext === '.slasm') {
        proc = slasm.eval_slasm(fs.readFileSync(p, { encoding: 'utf-8' }), p);
    } else if (ext === '.slasmjson') {
        const basedir = path.dirname(p);
        const parsed = JSON.parse(fs.readFileSync(p, { encoding: 'utf-8' }));
        const [instr, labels, , , imports] = parsed;
        proc = slasm.evaluate(instr.map(String), labels ?? [], [], [], imports ?? [], basedir);
    } else if (ext === '.slasmbin' || ext === '.slasmz') {
        const basedir = path.dirname(p);
        let buff = fs.readFileSync(p);
        if (isEncrypted(buff)) {
            if (!key) { console.error('file is encrypted, provide --key'); return; }
            buff = decrypt(buff, key);
        }
        if (ext === '.slasmz') buff = zlib.inflateSync(buff);
        const [instr, labels, , exports, imports, inlineModules] = slasm.SLASMBin.unpack(buff);
        proc = slasm.evaluate(instr.map(String), labels ?? [], [], [], imports ?? [], basedir, exports ?? [], inlineModules ?? []);
    } else {
        console.log('unknown extension:', ext);
        return;
    }

    attachStdinInput(proc);
    await proc.result;
}
