import fs   from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import slasm from '../interpreter';
import { encryptFile, decrypt, isEncrypted } from './encrypt';

export type ExportEntry = { ip: number; name: string; args: number; returns: number };
export type ImportEntry = { path: string; namespace: string; key?: string };

export type ParsedSLASM = [
    Array<string|number>,
    { ip: number; name: string }[],
    { ip: number; text: string }[],
    ExportEntry[]?,
    ImportEntry[]?,
];

const MAGIC   = 'SLB5';
const VERSION = 8;

const ITEM_UINT   = 0;
const ITEM_NEG    = 1;
const ITEM_STRING = 2;

function encodeVarint(n: number): number[] {
    const bytes: number[] = [];
    while (n > 127) { bytes.push((n & 0x7F) | 0x80); n >>>= 7; }
    bytes.push(n & 0x7F);
    return bytes;
}

function decodeVarint(buf: Buffer, offset: number): { value: number; next: number } {
    let n = 0, shift = 0;
    while (true) {
        if (offset >= buf.length) throw new Error(`decodeVarint: buffer overrun at offset ${offset}`);
        const b = buf[offset++];
        n |= (b & 0x7F) << shift;
        if ((b & 0x80) === 0) break;
        shift += 7;
    }
    return { value: n, next: offset };
}

class Writer {
    private bytes: number[] = [];

    varint(n: number)   { this.bytes.push(...encodeVarint(n)); }
    byte(b: number)     { this.bytes.push(b & 0xFF); }
    string(s: string)   { const b = Buffer.from(s, 'utf8'); this.varint(b.length); this.bytes.push(...b); }
    uint32le(n: number) { this.bytes.push(n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF); }
    raw(buf: Buffer)    { this.bytes.push(...buf); }

    toBuffer(): Buffer { return Buffer.from(this.bytes); }
}

class Reader {
    offset = 0;
    constructor(private buf: Buffer) {}

    varint(): number {
        const { value, next } = decodeVarint(this.buf, this.offset);
        this.offset = next;
        return value;
    }
    byte(): number {
        if (this.offset >= this.buf.length) throw new Error(`Reader: buffer overrun at ${this.offset}`);
        return this.buf[this.offset++];
    }
    string(): string {
        const len = this.varint();
        const s = this.buf.slice(this.offset, this.offset + len).toString('utf8');
        this.offset += len;
        return s;
    }
    uint32le(): number {
        const v = this.buf.readUInt32LE(this.offset);
        this.offset += 4;
        return v;
    }
    remaining(): number { return this.buf.length - this.offset; }
}

// ─── const table helpers ─────────────────────────────────────────────────────

function buildConstTable(parsed: ParsedSLASM): { table: string[]; index: Record<string, number> } {
    const [code, labels, comments, exports = [], imports = []] = parsed;
    const table: string[] = [];
    const index: Record<string, number> = {};
    const add = (s: string) => { if (!(s in index)) { index[s] = table.length; table.push(s); } };

    for (const item of code) {
        const n = Number(item);
        if (!Number.isFinite(n) || !Number.isInteger(n)) add(String(item));
    }
    labels.forEach(l => add(l.name));
    comments.forEach(c => add(c.text));
    exports.forEach(e => add(e.name));
    imports.forEach(i => { add(i.path); add(i.namespace); if (i.key) add(i.key); });

    return { table, index };
}

function writeInstructions(w: Writer, instructions: Array<string|number>, index: Record<string, number>) {
    w.varint(instructions.length);
    for (const item of instructions) {
        const n = Number(item);
        if (Number.isFinite(n) && Number.isInteger(n)) {
            if (n >= 0) { w.byte(ITEM_UINT); w.varint(n); }
            else        { w.byte(ITEM_NEG);  w.varint(-n); }
        } else {
            w.byte(ITEM_STRING);
            w.varint(index[String(item)]);
        }
    }
}

function readInstructions(r: Reader, constTable: string[]): Array<string|number> {
    const len = r.varint();
    const result: Array<string|number> = [];
    for (let i = 0; i < len; i++) {
        const type = r.byte();
        if (type === ITEM_UINT)     result.push(r.varint());
        else if (type === ITEM_NEG) result.push(-r.varint());
        else                        result.push(constTable[r.varint()]);
    }
    return result;
}

// ─── SLASMBin ────────────────────────────────────────────────────────────────

export default class SLASMBin {

    static pack(parsed: ParsedSLASM): Buffer {
        const [code, labels, comments, exports = [], imports = []] = parsed;
        const { table, index } = buildConstTable(parsed);
        const w = new Writer();

        w.raw(Buffer.from(MAGIC, 'ascii'));
        w.byte(VERSION);

        w.varint(table.length);
        for (const s of table) w.string(s);

        writeInstructions(w, code, index);

        w.varint(labels.length);
        for (const l of labels) { w.uint32le(l.ip); w.varint(index[l.name]); }

        w.varint(comments.length);
        for (const c of comments) { w.uint32le(c.ip); w.varint(index[c.text]); }

        w.varint(exports.length);
        for (const e of exports) {
            w.uint32le(e.ip);
            w.varint(index[e.name]);
            w.varint(e.args);
            w.varint(e.returns);
        }

        w.varint(imports.length);
        for (const i of imports) {
            w.varint(index[i.path]);
            w.varint(index[i.namespace]);
            w.byte(i.key ? 1 : 0);
            if (i.key) w.varint(index[i.key]);
        }

        return w.toBuffer();
    }

    static unpack(buffer: Buffer): ParsedSLASM {
        const r = new Reader(buffer);

        const magic = buffer.slice(0, 4).toString('ascii');
        if (magic === 'SLBE') throw new Error('file is encrypted, provide --key');
        if (magic !== MAGIC)  throw new Error(`Not a SLASM binary (got magic: ${magic})`);
        r.offset = 4;
        const version = r.byte();

        const constCount = r.varint();
        const constTable: string[] = [];
        for (let i = 0; i < constCount; i++) constTable.push(r.string());

        const code = readInstructions(r, constTable);

        const labelsLen = r.varint();
        const labels: { ip: number; name: string }[] = [];
        for (let i = 0; i < labelsLen; i++)
            labels.push({ ip: r.uint32le(), name: constTable[r.varint()] });

        const commentsLen = r.varint();
        const comments: { ip: number; text: string }[] = [];
        for (let i = 0; i < commentsLen; i++) {
            if (version >= 6) {
                comments.push({ ip: r.uint32le(), text: constTable[r.varint()] });
            } else {
                comments.push({ ip: 0, text: constTable[r.varint()] });
            }
        }

        const exportsLen = r.varint();
        const exports: ExportEntry[] = [];
        for (let i = 0; i < exportsLen; i++)
            exports.push({ ip: r.uint32le(), name: constTable[r.varint()], args: r.varint(), returns: r.varint() });

        const imports: ImportEntry[] = [];
        if (version >= 8 && r.remaining() > 0) {
            const importsLen = r.varint();
            for (let i = 0; i < importsLen; i++) {
                const imp: ImportEntry = { path: constTable[r.varint()], namespace: constTable[r.varint()] };
                if (r.byte() === 1) imp.key = constTable[r.varint()];
                imports.push(imp);
            }
        }

        return [code, labels, comments, exports, imports];
    }

    static packFile(filepath: string, useZ = false, key?: string): string {
        const p   = path.normalize(filepath);
        if (!fs.existsSync(p)) throw new Error(`no such file: ${p}`);
        const ext = path.extname(p);

        let parsed: ParsedSLASM;
        if (ext === '.slasm') {
            const r = slasm.parse(slasm.tokenize(fs.readFileSync(p, 'utf-8')));
            parsed = [r.instructions, r.labels, r.comments, r.exports, r.imports];
        } else if (ext === '.slasmjson') {
            parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
        } else if (ext === '.slasmbin' || ext === '.slasmz') {
            let buff = fs.readFileSync(p);
            if (isEncrypted(buff)) {
                if (!key) throw new Error('file is encrypted, provide --key');
                buff = decrypt(buff, key);
            }
            if (ext === '.slasmz') buff = zlib.inflateSync(buff);
            parsed = SLASMBin.unpack(buff);
        } else {
            throw new Error(`unknown extension: ${ext}`);
        }

        let buff = SLASMBin.pack(parsed);
        if (useZ) buff = zlib.deflateSync(buff);

        const outExt  = useZ ? '.slasmz' : '.slasmbin';
        const outPath = path.join(path.dirname(p), path.basename(p, ext) + outExt);
        fs.writeFileSync(outPath, buff);

        if (key) return encryptFile(outPath, key);
        return outPath;
    }

    static unpackFile(filepath: string, key?: string): string {
        const p   = path.normalize(filepath);
        if (!fs.existsSync(p)) throw new Error(`no such file: ${p}`);
        const ext = path.extname(p);
        if (ext !== '.slasmbin' && ext !== '.slasmz')
            throw new Error(`expected .slasmbin or .slasmz, got: ${ext}`);

        let buff = fs.readFileSync(p);
        if (isEncrypted(buff)) {
            if (!key) throw new Error('file is encrypted, provide --key');
            buff = decrypt(buff, key);
        }
        if (ext === '.slasmz') buff = zlib.inflateSync(buff);

        const [code, labels, comments, exports] = SLASMBin.unpack(buff);
        const baseName = path.basename(p, ext);
        const outPath  = path.join(path.dirname(p), baseName + '.slasmjson');
        fs.writeFileSync(outPath, JSON.stringify([code, labels, comments, exports], null, 2));
        return outPath;
    }
}
