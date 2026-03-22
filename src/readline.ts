import fs from 'node:fs';

export function readlineSync(prompt: string = ''): string {
    const buf = Buffer.alloc(1024);
    if (prompt) process.stdout.write(prompt);
    const n = fs.readSync(0, buf, 0, buf.length, null);
    return buf.slice(0, n).toString().replace(/\r?\n$/, '');
}
