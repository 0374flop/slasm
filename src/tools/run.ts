import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import slasm from '../interpreter';
import { isEncrypted, decrypt } from './encrypt';
import { checkMissingModules } from '../interpreter/loader';

export default function run(filepath: string, key?: string) {
    const p = path.resolve(filepath);
    if (!fs.existsSync(p)) {
        console.log('no such file:', p);
        return;
    }
    const ext = path.extname(p);
    checkMissingModules(p);

    if (ext == '.slasm') {
        slasm.eval_slasm(fs.readFileSync(p, { encoding: 'utf-8' }), p);
    } else if (ext == '.slasmjson') {
        const basedir = path.dirname(p);
        const parsed = JSON.parse(fs.readFileSync(p, { encoding: 'utf-8' }));
        const [instr, labels, , , imports] = parsed;
        slasm.evaluate(instr.map(String), labels ?? [], [], [], imports ?? [], basedir);
    } else if (ext == '.slasmbin' || ext == '.slasmz') {
        const basedir = path.dirname(p);
        let buff = fs.readFileSync(p);
        if (isEncrypted(buff)) {
            if (!key) { console.error('file is encrypted, provide --key'); return; }
            buff = decrypt(buff, key);
        }
        if (ext == '.slasmz') buff = zlib.inflateSync(buff);
        const [instr, labels, , exports, imports, inlineModules] = slasm.SLASMBin.unpack(buff);
        slasm.evaluate(instr.map(String), labels ?? [], [], [], imports ?? [], basedir, exports ?? [], inlineModules ?? []);
    } else {
        console.log('unknown extension:', ext);
    }
}
