import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import slasm from '../interpreter';

export default function run(filepath: string) {
    const p = path.normalize(filepath);
    if (!fs.existsSync(p)) {
        console.log('no such file:', p);
        return;
    }
    const ext = path.extname(p);
    if (ext == '.slasm') {
        slasm.eval_slasm(fs.readFileSync(p, { encoding: 'utf-8' }));
    } else if (ext == '.slasmjson') {
        const [instr, labels] = JSON.parse(fs.readFileSync(p, { encoding: 'utf-8' }));
        slasm.evaluate(instr, undefined, labels);
    } else if (ext == '.slasmbin') {
        const [instr, labels] = slasm.SLASMBin.unpack(fs.readFileSync(p));
        slasm.evaluate(instr.map(String), undefined, labels);
    } else if (ext == '.slasmz') {
        const [instr, labels] = slasm.SLASMBin.unpack(zlib.inflateSync(fs.readFileSync(p)));
        slasm.evaluate(instr.map(String), undefined, labels);
    } else {
        console.log('unknown extension:', ext);
    }
}