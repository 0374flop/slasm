import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MAGIC_ENC  = 'SLBE';
export const MAGIC_NORM = 'SLBM';
const VERSION = 1;

function deriveKey(key: string): Buffer {
    return crypto.createHash('sha256').update(key, 'utf8').digest();
}

export function isEncrypted(buffer: Buffer): boolean {
    return buffer.length >= 4 && buffer.slice(0, 4).toString('ascii') === MAGIC_ENC;
}

export function encrypt(data: Buffer, key: string): Buffer {
    const derivedKey = deriveKey(key);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);

    const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();

    const header = Buffer.alloc(4 + 1 + 12 + 16);
    let off = 0;
    header.write(MAGIC_ENC, off, 'ascii'); off += 4;
    header[off++] = VERSION;
    iv.copy(header, off);                  off += 12;
    tag.copy(header, off);

    return Buffer.concat([header, ciphertext]);
}

export function decrypt(enc: Buffer, key: string): Buffer<ArrayBuffer> {
    const magic = enc.slice(0, 4).toString('ascii');
    if (magic !== MAGIC_ENC) throw new Error('Not an encrypted SLASM file');

    let off = 4;
    const version = enc[off++];
    if (version !== VERSION) throw new Error(`Unsupported encryption version: ${version}`);

    const iv         = enc.slice(off, off + 12); off += 12;
    const tag        = enc.slice(off, off + 16); off += 16;
    const ciphertext = enc.slice(off);

    const derivedKey = deriveKey(key);
    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
    decipher.setAuthTag(tag);

    try {
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]) as Buffer<ArrayBuffer>;
    } catch {
        throw new Error('Decryption failed: wrong key or corrupted file');
    }
}

export function encryptFile(filepath: string, key: string): string {
    const p = path.normalize(filepath);
    if (!fs.existsSync(p)) throw new Error(`no such file: ${p}`);

    const ext = path.extname(p);
    if (ext !== '.slasmbin' && ext !== '.slasmz') {
        throw new Error(`encrypt supports: .slasmbin, .slasmz (got ${ext})`);
    }

    const data = fs.readFileSync(p);
    if (isEncrypted(data)) throw new Error('file is already encrypted');

    fs.writeFileSync(p, encrypt(data, key));
    return p;
}

export function decryptFile(filepath: string, key: string): string {
    const p = path.normalize(filepath);
    if (!fs.existsSync(p)) throw new Error(`no such file: ${p}`);

    const ext = path.extname(p);
    if (ext !== '.slasmbin' && ext !== '.slasmz') {
        throw new Error(`decrypt supports: .slasmbin, .slasmz (got ${ext})`);
    }

    const enc = fs.readFileSync(p);
    if (!isEncrypted(enc)) throw new Error('file is not encrypted');

    fs.writeFileSync(p, decrypt(enc, key));
    return p;
}
