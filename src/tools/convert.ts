import fs   from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import slasm from '../interpreter';
import SLASMBin, { type ParsedSLASM } from './packunpack';
import decompile from './decompiler';
import { isEncrypted, decrypt } from './encrypt';

type Format = 'slasm' | 'slasmjson' | 'slasmbin' | 'slasmz';

const FORMATS = new Set<string>(['slasm', 'slasmjson', 'slasmbin', 'slasmz']);

function parseFormat(s: string): Format {
    const f = s.replace(/^\./, '');
    if (!FORMATS.has(f)) throw new Error(`unknown format '${s}'. valid: slasm, slasmjson, slasmbin, slasmz`);
    return f as Format;
}

function readParsed(filepath: string, key?: string): ParsedSLASM {
    const ext = path.extname(filepath);
    if (ext === '.slasm') {
        const r = slasm.parse(slasm.tokenize(fs.readFileSync(filepath, 'utf-8')));
        return [r.instructions, r.labels, r.comments, r.exports];
    }
    if (ext === '.slasmjson') {
        return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    }
    if (ext === '.slasmbin' || ext === '.slasmz') {
        let buf = fs.readFileSync(filepath);
        if (isEncrypted(buf)) {
            if (!key) throw new Error('file is encrypted, provide --key');
            buf = decrypt(buf, key);
        }
        if (ext === '.slasmz') buf = zlib.inflateSync(buf);
        return SLASMBin.unpack(buf);
    }
    throw new Error(`cannot read format: ${ext}`);
}

export default function convert(filepath: string, toFormat: string, key?: string): string {
    const fmt    = parseFormat(toFormat);
    const p      = path.resolve(filepath);
    if (!fs.existsSync(p)) throw new Error(`no such file: ${p}`);

    const srcExt = path.extname(p);
    const base   = path.join(path.dirname(p), path.basename(p, srcExt));
    const outPath = base + '.' + fmt;

    if (srcExt === '.' + fmt) throw new Error(`file is already in format .${fmt}`);

    const parsed = readParsed(p, key);

    if (fmt === 'slasm') {
        fs.writeFileSync(outPath, decompile(parsed), 'utf-8');
    } else if (fmt === 'slasmjson') {
        fs.writeFileSync(outPath, JSON.stringify(parsed, null, 2), 'utf-8');
    } else if (fmt === 'slasmbin') {
        fs.writeFileSync(outPath, SLASMBin.pack(parsed));
    } else if (fmt === 'slasmz') {
        fs.writeFileSync(outPath, zlib.deflateSync(SLASMBin.pack(parsed)));
    }

    return outPath;
}
