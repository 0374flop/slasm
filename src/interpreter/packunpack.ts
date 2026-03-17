export type ParsedSLASM = [Array<string | number>, { ip: number; name: string }[], string[]];

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
        const [code, labels, comments] = parsed;
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

        const buffers: Buffer[] = [];

        // HEADER
        buffers.push(Buffer.from("SLBM"));
        buffers.push(Buffer.from([1])); // версия

        // CONST_TABLE
        buffers.push(this.encodeVarint(constTable.length));
        for (const str of constTable) {
            const b = Buffer.from(str, "utf8");
            buffers.push(this.encodeVarint(b.length));
            buffers.push(b);
        }

        // CODE
        buffers.push(this.encodeVarint(code.length));
        for (const item of code) {
            if (typeof item === "number" || !isNaN(Number(item))) {
                buffers.push(Buffer.from([0])); // число
                buffers.push(this.encodeVarint(Number(item)));
            } else {
                buffers.push(Buffer.from([1])); // строка
                buffers.push(this.encodeVarint(constIndex[item]));
            }
        }

        // LABELS
        buffers.push(this.encodeVarint(labels.length));
        for (const lbl of labels) {
            const buf = Buffer.alloc(4);
            buf.writeUInt32LE(lbl.ip, 0);
            buffers.push(buf);
            buffers.push(this.encodeVarint(constIndex[lbl.name]));
        }

        // COMMENTS
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

        return Buffer.concat(buffers);
    }

    static unpack(buffer: Buffer): ParsedSLASM {
        let offset = 0;

        const readVarint = (): number => {
            const { value, next } = this.decodeVarint(buffer, offset);
            offset = next;
            return value;
        };

        // magic check
        const magic = buffer.slice(0, 4).toString();
        if (magic !== "SLBM") throw new Error("Not a SLASM binary");
        offset += 4;
        const version = buffer[offset++];

        // CONST_TABLE
        const constTable: string[] = [];
        const constCount = readVarint();
        for (let i = 0; i < constCount; i++) {
            const len = readVarint();
            const str = buffer.slice(offset, offset + len).toString("utf8");
            constTable.push(str);
            offset += len;
        }

        // CODE
        const codeLen = readVarint();
        const code: Array<string | number> = [];
        for (let i = 0; i < codeLen; i++) {
            const type = buffer[offset++];
            if (type === 0) code.push(readVarint());
            else {
                const idx = readVarint();
                code.push(constTable[idx]);
            }
        }

        // LABELS
        const labelsLen = readVarint();
        const labels: { ip: number; name: string }[] = [];
        for (let i = 0; i < labelsLen; i++) {
            const ip = buffer.readUInt32LE(offset);
            offset += 4;
            const nameIdx = readVarint();
            labels.push({ ip, name: constTable[nameIdx] });
        }

        // COMMENTS
        const commentsLen = readVarint();
        const comments: string[] = [];
        for (let i = 0; i < commentsLen; i++) {
            const len = readVarint();
            const str = buffer.slice(offset, offset + len).toString("utf8");
            comments.push(str);
            offset += len;
        }

        return [code, labels, comments];
    }
}