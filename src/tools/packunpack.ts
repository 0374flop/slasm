import fs   from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import slasm from '../interpreter';
import { encryptFile, decrypt, isEncrypted } from './encrypt';

export type ExportEntry       = { ip: number; name: string; args: number; returns: number };
export type ImportEntry       = { path: string; namespace: string };
export type InlineSlasmModule = { type: 'slasm'; namespace: string; instructions: Array<string|number>; labels: { ip: number; name: string }[]; exports: ExportEntry[] };
export type InlineJsModule    = { type: 'js';   namespace: string; source: string };
export type InlineModule      = InlineSlasmModule | InlineJsModule;
export type ParsedSLASM       = [
    Array<string|number>,
    { ip: number; name: string }[],
    string[],
    ExportEntry[]?,
    ImportEntry[]?,
    InlineModule[]?
];

const MAGIC   = 'SLB5';
const VERSION = 5;

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

    varint(n: number)  { this.bytes.push(...encodeVarint(n)); }
    byte(b: number)    { this.bytes.push(b & 0xFF); }
    string(s: string)  { const b = Buffer.from(s, 'utf8'); this.varint(b.length); this.bytes.push(...b); }
    uint32le(n: number){ this.bytes.push(n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF); }
    raw(buf: Buffer)   { this.bytes.push(...buf); }

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

function buildConstTable(parsed: ParsedSLASM): { table: string[]; index: Record<string, number> } {
    const [code, labels, comments, exports = [], imports = [], inlineModules = []] = parsed;
    const table: string[] = [];
    const index: Record<string, number> = {};
    const add = (s: string) => { if (!(s in index)) { index[s] = table.length; table.push(s); } };

    const addInstr = (instructions: Array<string|number>) => {
        for (const item of instructions) {
            const n = Number(item);
            if (!Number.isFinite(n) || !Number.isInteger(n)) add(String(item));
        }
    };

    addInstr(code);
    labels.forEach(l => add(l.name));
    comments.forEach(c => add(c));
    exports.forEach(e => add(e.name));
    imports.forEach(i => { add(i.path); add(i.namespace); });
    for (const m of inlineModules) {
        add(m.namespace);
        if (m.type === 'slasm') {
            addInstr(m.instructions);
            m.labels.forEach(l => add(l.name));
            m.exports.forEach(e => add(e.name));
        } else {
            add(m.source);
        }
    }

    return { table, index };
}

function writeInstructions(w: Writer, instructions: Array<string|number>, index: Record<string, number>) {
    w.varint(instructions.length);
    for (const item of instructions) {
        const n = Number(item);
        if (Number.isFinite(n) && Number.isInteger(n)) {
            if (n >= 0) {
                w.byte(ITEM_UINT);
                w.varint(n);
            } else {
                w.byte(ITEM_NEG);
                w.varint(-n);
            }
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
        if (type === ITEM_UINT)        result.push(r.varint());
        else if (type === ITEM_NEG)    result.push(-r.varint());
        else                           result.push(constTable[r.varint()]);
    }
    return result;
}

function packInlineModule(w: Writer, m: InlineModule, index: Record<string, number>) {
    if (m.type === 'js') {
        w.byte(1);
        w.varint(index[m.namespace]);
        w.varint(index[m.source]);
    } else {
        w.byte(0);
        w.varint(index[m.namespace]);
        writeInstructions(w, m.instructions, index);
        w.varint(m.labels.length);
        for (const l of m.labels) { w.uint32le(l.ip); w.varint(index[l.name]); }
        w.varint(m.exports.length);
        for (const e of m.exports) {
            w.uint32le(e.ip);
            w.varint(index[e.name]);
            w.varint(e.args);
            w.varint(e.returns);
        }
    }
}

function unpackInlineModule(r: Reader, constTable: string[]): InlineModule {
    const type      = r.byte();
    const namespace = constTable[r.varint()];
    if (type === 1) {
        return { type: 'js', namespace, source: constTable[r.varint()] };
    }
    const instructions = readInstructions(r, constTable);
    const labelsLen    = r.varint();
    const labels: { ip: number; name: string }[] = [];
    for (let i = 0; i < labelsLen; i++) { labels.push({ ip: r.uint32le(), name: constTable[r.varint()] }); }
    const exportsLen = r.varint();
    const exports: ExportEntry[] = [];
    for (let i = 0; i < exportsLen; i++) {
        exports.push({ ip: r.uint32le(), name: constTable[r.varint()], args: r.varint(), returns: r.varint() });
    }
    return { type: 'slasm', namespace, instructions, labels, exports };
}

export default class SLASMBin {

    static pack(parsed: ParsedSLASM): Buffer {
        const [code, labels, comments, exports = [], imports = [], inlineModules = []] = parsed;
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
        for (const c of comments) w.varint(index[c]);

        w.varint(exports.length);
        for (const e of exports) {
            w.uint32le(e.ip);
            w.varint(index[e.name]);
            w.varint(e.args);
            w.varint(e.returns);
        }

        w.varint(imports.length);
        for (const i of imports) { w.varint(index[i.path]); w.varint(index[i.namespace]); }

        w.varint(inlineModules.length);
        for (const m of inlineModules) packInlineModule(w, m, index);

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
        for (let i = 0; i < labelsLen; i++) labels.push({ ip: r.uint32le(), name: constTable[r.varint()] });

        const commentsLen = r.varint();
        const comments: string[] = [];
        for (let i = 0; i < commentsLen; i++) comments.push(constTable[r.varint()]);

        const exportsLen = r.varint();
        const exports: ExportEntry[] = [];
        for (let i = 0; i < exportsLen; i++) {
            exports.push({ ip: r.uint32le(), name: constTable[r.varint()], args: r.varint(), returns: r.varint() });
        }

        const importsLen = r.varint();
        const imports: ImportEntry[] = [];
        for (let i = 0; i < importsLen; i++) imports.push({ path: constTable[r.varint()], namespace: constTable[r.varint()] });

        const inlineModules: InlineModule[] = [];
        if (r.remaining() > 0) {
            const count = r.varint();
            for (let i = 0; i < count; i++) inlineModules.push(unpackInlineModule(r, constTable));
        }

        return [code, labels, comments, exports, imports, inlineModules];
    }

    static collectInlineModules(imports: ImportEntry[], basedir: string, seen = new Set<string>()): InlineModule[] {
        const result: InlineModule[] = [];
        const EXTS = ['.slasm', '.slasmbin', '.slasmz', '.slasmjson', '.js'];

        for (const imp of imports) {
            if (seen.has(imp.namespace)) continue;
            seen.add(imp.namespace);

            const base = path.resolve(basedir, imp.path);
            let resolved = fs.existsSync(base) ? base : '';
            if (!resolved) {
                for (const ext of EXTS) {
                    const candidate = base + ext;
                    if (fs.existsSync(candidate)) { resolved = candidate; break; }
                }
            }
            if (!resolved) throw new Error(`module not found: ${base}`);

            const ext = path.extname(resolved);
            if (ext === '.js') {
                result.push({ type: 'js', namespace: imp.namespace, source: fs.readFileSync(resolved, 'utf-8') });
            } else {
                let instructions: Array<string|number>;
                let labels: { ip: number; name: string }[];
                let modExports: ExportEntry[];
                let nestedImports: ImportEntry[];

                if (ext === '.slasm') {
                    const r = slasm.parse(slasm.tokenize(fs.readFileSync(resolved, 'utf-8')));
                    instructions  = r.instructions;
                    labels        = r.labels;
                    modExports    = r.exports;
                    nestedImports = r.imports;
                } else {
                    let buff = fs.readFileSync(resolved);
                    if (ext === '.slasmz') buff = zlib.inflateSync(buff);
                    const [i, l, , e, imp2] = SLASMBin.unpack(buff);
                    instructions  = i;
                    labels        = l;
                    modExports    = e ?? [];
                    nestedImports = imp2 ?? [];
                }

                result.push({ type: 'slasm', namespace: imp.namespace, instructions, labels, exports: modExports });
                result.push(...SLASMBin.collectInlineModules(nestedImports, path.dirname(resolved), seen));
            }
        }
        return result;
    }

    static packFile(filepath: string, useZ = false, key?: string, bundleModules = true): string {
        const p   = path.normalize(filepath);
        if (!fs.existsSync(p)) throw new Error(`no such file: ${p}`);
        const ext = path.extname(p);

        let parsedata: ParsedSLASM;
        if (ext === '.slasm') {
            const r = slasm.parse(slasm.tokenize(fs.readFileSync(p, 'utf-8')));
            parsedata = [r.instructions, r.labels, r.comments.map(c => c.text), r.exports, r.imports];
        } else if (ext === '.slasmjson') {
            parsedata = JSON.parse(fs.readFileSync(p, 'utf-8'));
        } else if (ext === '.slasmbin' || ext === '.slasmz') {
            let buff = fs.readFileSync(p);
            if (ext === '.slasmz') buff = zlib.inflateSync(buff);
            parsedata = SLASMBin.unpack(buff);
        } else {
            throw new Error(`unknown extension: ${ext}`);
        }

        if (bundleModules) {
            const rawImports   = parsedata[4] ?? [];
            const basedir      = path.dirname(path.resolve(p));
            const inlineMods   = SLASMBin.collectInlineModules(rawImports, basedir);
            parsedata = [parsedata[0], parsedata[1], parsedata[2], parsedata[3], [], inlineMods];
        }

        let buff = SLASMBin.pack(parsedata);
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
        if (ext !== '.slasmbin' && ext !== '.slasmz') throw new Error(`expected .slasmbin or .slasmz, got: ${ext}`);

        let buff = fs.readFileSync(p);
        if (isEncrypted(buff)) {
            if (!key) throw new Error('file is encrypted, provide --key');
            buff = decrypt(buff, key);
        }
        if (ext === '.slasmz') buff = zlib.inflateSync(buff);

        const [code, labels, comments, exports, imports, inlineModules] = SLASMBin.unpack(buff);
        const baseName = path.basename(p, ext);

        if (inlineModules && inlineModules.length > 0) {
            const outDir = path.join(path.dirname(p), baseName);
            if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

            const importEntries: ImportEntry[] = [];
            for (const m of inlineModules) {
                if (m.type === 'slasm') {
                    const modPath = path.join(outDir, m.namespace + '.slasmjson');
                    fs.writeFileSync(modPath, JSON.stringify([m.instructions, m.labels, [], m.exports], null, 2));
                    importEntries.push({ path: './' + m.namespace, namespace: m.namespace });
                } else {
                    const modPath = path.join(outDir, m.namespace + '.js');
                    fs.writeFileSync(modPath, m.source, 'utf-8');
                    importEntries.push({ path: './' + m.namespace + '.js', namespace: m.namespace });
                }
            }

            const mainPath = path.join(outDir, baseName + '.slasmjson');
            fs.writeFileSync(mainPath, JSON.stringify([code, labels, comments, exports ?? [], importEntries], null, 2));
            return outDir;
        }

        const outPath = path.join(path.dirname(p), baseName + '.slasmjson');
        fs.writeFileSync(outPath, JSON.stringify([code, labels, comments, exports, imports], null, 2));
        return outPath;
    }
}
