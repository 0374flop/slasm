import fs   from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import archiver from 'archiver';
import slasm from '../interpreter';
import SLASMBin, { type ParsedSLASM } from './packunpack';
import decompile from './decompiler';
import { isEncrypted, decrypt, encrypt } from './encrypt';
import { type PkgFormat } from './pkg';

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

function compileToBin(filepath: string): Buffer {
    const ext = path.extname(filepath);
    if (ext === '.slasmbin') return fs.readFileSync(filepath);
    if (ext === '.slasmz')   return zlib.inflateSync(fs.readFileSync(filepath));
    if (ext === '.slasmjson') return SLASMBin.pack(JSON.parse(fs.readFileSync(filepath, 'utf-8')));
    if (ext === '.slasm') {
        const r = slasm.parse(slasm.tokenize(fs.readFileSync(filepath, 'utf-8')));
        return SLASMBin.pack([r.instructions, r.labels, r.comments, r.exports, r.imports]);
    }
    throw new Error(`cannot compile: ${filepath}`);
}

export async function packSingleFile(filepath: string, format: PkgFormat = 'slpkg', key?: string): Promise<string> {
    const abs  = path.resolve(filepath);
    if (!fs.existsSync(abs)) throw new Error(`no such file: ${abs}`);

    const name    = path.basename(abs, path.extname(abs));
    const binName = name + '.slasmbin';
    const ext     = format === 'slpkgz' ? '.slpkgz' : format === 'slpkgj' ? '.slpkgj' : '.slpkg';
    const outPath = path.join(path.dirname(abs), name + ext);

    const bin  = compileToBin(abs);
    const meta = JSON.stringify({ name, main: binName, modules: {} }, null, 2);

    if (format === 'slpkgj') {
        const json: Record<string, string> = {
            'slasm.json': meta,
            [binName]: bin.toString('base64'),
        };
        fs.writeFileSync(outPath, JSON.stringify(json, null, 2), 'utf-8');
        return outPath;
    }

    await new Promise<void>((resolve, reject) => {
        const output = fs.createWriteStream(outPath);
        let arc: archiver.Archiver;
        if (key) {
            // @ts-ignore — archiver-zip-encrypted не имеет типов
            require('archiver-zip-encrypted');
            arc = archiver.create('zip-encrypted' as any, {
                zlib: { level: format === 'slpkgz' ? 9 : 0 },
                encryptionMethod: 'aes256',
                password: key,
            } as any);
        } else {
            arc = archiver('zip', { zlib: { level: format === 'slpkgz' ? 9 : 0 } });
        }
        output.on('close', resolve);
        arc.on('error', reject);
        arc.pipe(output);
        arc.append(Buffer.from(meta, 'utf-8'), { name: 'slasm.json' });
        arc.append(bin, { name: binName });
        arc.finalize();
    });

    return outPath;
}
