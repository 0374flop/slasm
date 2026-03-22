import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import slasm from '../interpreter';
import { isEncrypted, decrypt } from './encrypt';

export default function run(filepath: string, key?: string) {
    const p = path.resolve(filepath);
    if (!fs.existsSync(p)) {
        console.log('no such file:', p);
        return;
    }
    const ext = path.extname(p);

    if (ext == '.slasm') {
        slasm.eval_slasm(fs.readFileSync(p, { encoding: 'utf-8' }), p);
    } else if (ext == '.slasmjson') {
        const basedir = path.dirname(p);
        const parsed = JSON.parse(fs.readFileSync(p, { encoding: 'utf-8' }));
        const [instr, labels] = parsed;
        slasm.evaluate(instr.map(String), labels ?? [], [], [], [], basedir);
    } else if (ext == '.slasmbin' || ext == '.slasmz') {
        const basedir = path.dirname(p);
        let buff = fs.readFileSync(p);
        if (isEncrypted(buff)) {
            if (!key) { console.error('file is encrypted, provide --key'); return; }
            buff = decrypt(buff, key);
        }
        if (ext == '.slasmz') buff = zlib.inflateSync(buff);
        const [instr, labels] = slasm.SLASMBin.unpack(buff);
        slasm.evaluate(instr.map(String), labels ?? [], [], [], [], basedir);
    } else {
        console.log('unknown extension:', ext);
    }
}
