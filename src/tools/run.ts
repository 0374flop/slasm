import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import slasm from '../interpreter';

export default function run(filepath: string) {
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
    } else if (ext == '.slasmbin') {
        const basedir = path.dirname(p);
        const [instr, labels] = slasm.SLASMBin.unpack(fs.readFileSync(p));
        slasm.evaluate(instr.map(String), labels ?? [], [], [], [], basedir);
    } else if (ext == '.slasmz') {
        const basedir = path.dirname(p);
        const [instr, labels] = slasm.SLASMBin.unpack(zlib.inflateSync(fs.readFileSync(p)));
        slasm.evaluate(instr.map(String), labels ?? [], [], [], [], basedir);
    } else {
        console.log('unknown extension:', ext);
    }
}
