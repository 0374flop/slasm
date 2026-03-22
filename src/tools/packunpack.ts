import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import slasm from "../interpreter";
import { encryptFile, decrypt, isEncrypted } from './encrypt';

export type ExportEntry = { ip: number; name: string; args: number; returns: number };
export type ParsedSLASM = [Array<string | number>, { ip: number; name: string }[], string[], ExportEntry[]?];

export default class SLASMBin {
    private static encodeVarint(n: number): Buffer {
        const bytes: number[] = [];
        while (n > 127) {
            bytes.push((n & 0x7F) | 0x80);
            n >>= 7;
        }
        bytes.push(n);
        return Buffer.from(bytes);
    }

    private static decodeVarint(buffer: Buffer, offset = 0): { value: number; next: number } {
        let n = 0, shift = 0, i = offset;
        while (true) {
            const b = buffer[i++];
            n |= (b & 0x7F) << shift;
            if ((b & 0x80) === 0) break;
            shift += 7;
        }
        return { value: n, next: i };
    }

    static pack(parsed: ParsedSLASM): Buffer {
        const [code, labels, comments, exports = []] = parsed;
        const constTable: string[] = [];
        const constIndex: Record<string, number> = {};

        const addString = (s: string) => {
            if (!(s in constIndex)) {
                constIndex[s] = constTable.length;
                constTable.push(s);
            }
        };

        code.forEach(item => { if (typeof item === "string" && isNaN(Number(item))) addString(item); });
        labels.forEach(lbl => addString(lbl.name));
        if (comments) comments.forEach(c => addString(c));
        exports.forEach(e => addString(e.name));

        const buffers: Buffer[] = [];

        buffers.push(Buffer.from("SLBM"));
        buffers.push(Buffer.from([2]));

        buffers.push(this.encodeVarint(constTable.length));
        for (const str of constTable) {
            const b = Buffer.from(str, "utf8");
            buffers.push(this.encodeVarint(b.length));
            buffers.push(b);
        }

        buffers.push(this.encodeVarint(code.length));
        for (const item of code) {
            if (typeof item === "number" || !isNaN(Number(item))) {
                buffers.push(Buffer.from([0]));
                buffers.push(this.encodeVarint(Number(item)));
            } else {
                buffers.push(Buffer.from([1]));
                buffers.push(this.encodeVarint(constIndex[item]));
            }
        }

        buffers.push(this.encodeVarint(labels.length));
        for (const lbl of labels) {
            const buf = Buffer.alloc(4);
            buf.writeUInt32LE(lbl.ip, 0);
            buffers.push(buf);
            buffers.push(this.encodeVarint(constIndex[lbl.name]));
        }

        if (comments) {
            buffers.push(this.encodeVarint(comments.length));
            for (const c of comments) {
                const b = Buffer.from(c, "utf8");
                buffers.push(this.encodeVarint(b.length));
                buffers.push(b);
            }
        } else {
            buffers.push(this.encodeVarint(0));
        }

        buffers.push(this.encodeVarint(exports.length));
        for (const e of exports) {
            const buf = Buffer.alloc(4);
            buf.writeUInt32LE(e.ip, 0);
            buffers.push(buf);
            buffers.push(this.encodeVarint(constIndex[e.name]));
            buffers.push(this.encodeVarint(e.args));
            buffers.push(this.encodeVarint(e.returns));
        }

        return Buffer.concat(buffers);
    }

    static unpack(buffer: Buffer): ParsedSLASM {
        let offset = 0;

        const readVarint = (): number => {
            const { value, next } = this.decodeVarint(buffer, offset);
            offset = next;
            return value;
        };

        const magic = buffer.slice(0, 4).toString('ascii');
        if (magic === 'SLBE') throw new Error('file is encrypted, provide --key');
        if (magic !== 'SLBM') throw new Error('Not a SLASM binary');
        offset += 4;
        const version = buffer[offset++];

        const constTable: string[] = [];
        const constCount = readVarint();
        for (let i = 0; i < constCount; i++) {
            const len = readVarint();
            const str = buffer.slice(offset, offset + len).toString("utf8");
            constTable.push(str);
            offset += len;
        }

        const codeLen = readVarint();
        const code: Array<string | number> = [];
        for (let i = 0; i < codeLen; i++) {
            const type = buffer[offset++];
            if (type === 0) code.push(readVarint());
            else code.push(constTable[readVarint()]);
        }

        const labelsLen = readVarint();
        const labels: { ip: number; name: string }[] = [];
        for (let i = 0; i < labelsLen; i++) {
            const ip = buffer.readUInt32LE(offset);
            offset += 4;
            labels.push({ ip, name: constTable[readVarint()] });
        }

        const commentsLen = readVarint();
        const comments: string[] = [];
        for (let i = 0; i < commentsLen; i++) {
            const len = readVarint();
            const str = buffer.slice(offset, offset + len).toString("utf8");
            comments.push(str);
            offset += len;
        }

        const exports: ExportEntry[] = [];
        if (version >= 2 && offset < buffer.length) {
            const exportsLen = readVarint();
            for (let i = 0; i < exportsLen; i++) {
                const ip = buffer.readUInt32LE(offset);
                offset += 4;
                const name = constTable[readVarint()];
                const args = readVarint();
                const returns = readVarint();
                exports.push({ ip, name, args, returns });
            }
        }

        return [code, labels, comments, exports];
    }

    static packFile(filepath: string, useZ: boolean = false, key?: string): string {
        const p = path.normalize(filepath);
        if (!fs.existsSync(p)) throw new Error(`no such file: ${p}`);

        const ext = path.extname(p);
        let parsedata: ParsedSLASM;

        if (ext === '.slasm') {
            const code = fs.readFileSync(p, { encoding: 'utf-8' });
            const result = slasm.parse(slasm.tokenize(code));
            parsedata = [result.instructions, result.labels, result.comments.map(c => c.text), result.exports];
        } else if (ext === '.slasmjson') {
            parsedata = JSON.parse(fs.readFileSync(p, { encoding: 'utf-8' }));
        } else if (ext === '.slasmbin' || ext === '.slasmz') {
            let buff = fs.readFileSync(p);
            if (ext === '.slasmz') buff = zlib.inflateSync(buff);
            parsedata = this.unpack(buff);
        } else {
            throw new Error(`unknown extension: ${ext}`);
        }

        const outExt = useZ ? '.slasmz' : '.slasmbin';
        let buff = this.pack(parsedata);
        if (useZ) buff = zlib.deflateSync(buff);

        const outPath = path.join(path.dirname(p), path.basename(p, ext) + outExt);
        fs.writeFileSync(outPath, buff);

        if (key) return encryptFile(outPath, key);
        return outPath;
    }

    static unpackFile(filepath: string, key?: string): string {
        const p = path.normalize(filepath);
        if (!fs.existsSync(p)) throw new Error(`no such file: ${p}`);

        const ext = path.extname(p);
        if (ext !== '.slasmbin' && ext !== '.slasmz') {
            throw new Error(`expected .slasmbin or .slasmz, got: ${ext}`);
        }

        let buff = fs.readFileSync(p);

        if (isEncrypted(buff)) {
            if (!key) throw new Error('file is encrypted, provide --key');
            buff = decrypt(buff, key);
        }

        if (ext === '.slasmz') buff = zlib.inflateSync(buff);
        const parsedata = this.unpack(buff);

        const outPath = path.join(path.dirname(p), path.basename(p, ext) + '.slasmjson');
        fs.writeFileSync(outPath, JSON.stringify(parsedata, null, 2));
        return outPath;
    }
}
