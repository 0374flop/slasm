import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import SLASMBin, { type ParsedSLASM, type ExportEntry } from './packunpack';
import { isEncrypted, decrypt } from './encrypt';
import { unpackProject } from './pkg';

import _ARITY from '../interpreter/runinstruction/arity.json';
const ARITY = _ARITY as unknown as Record<string, [number, number]>;

function lit(val: string): string {
    if (val.startsWith('(')) return val;
    if (val.includes(' ')) return `"${val}"`;
    return val;
}

export function decompileFile(filepath: string, key?: string): string {
    const p = path.normalize(filepath);
    if (!fs.existsSync(p)) throw new Error(`no such file: ${p}`);
    const ext = path.extname(p);

    if (ext === '.slpkg' || ext === '.slpkgz' || ext === '.slpkgj') {
        return decompilePkg(p, key);
    } else if (ext === '.slasmbin' || ext === '.slasmz') {
        let buff = fs.readFileSync(p);
        if (isEncrypted(buff)) {
            if (!key) throw new Error('file is encrypted, provide --key');
            buff = decrypt(buff, key);
        }
        if (ext === '.slasmz') buff = zlib.inflateSync(buff);
        return decompile(SLASMBin.unpack(buff));
    } else if (ext === '.slasmjson') {
        return decompile(JSON.parse(fs.readFileSync(p, { encoding: 'utf-8' })));
    } else {
        throw new Error(`decompile supports: .slasmjson, .slasmbin, .slasmz, .slpkg, .slpkgz, .slpkgj`);
    }
}

function removeDirSync(dir: string): void {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) removeDirSync(full);
        else fs.unlinkSync(full);
    }
    fs.rmdirSync(dir);
}

function loadJsArity(jsFiles: string[], imports: { path: string; namespace: string }[]): Record<string, [number, number]> {
    const extraArity: Record<string, [number, number]> = {};
    for (const jsFile of jsFiles) {
        const jsBasename = path.basename(jsFile);
        const imp = imports.find(i => path.basename(i.path) === jsBasename);
        const ns  = imp?.namespace;
        if (!ns) continue;
        try {
            const mod = require(path.resolve(jsFile)) as Record<string, { args?: number; returns?: number }>;
            for (const [name, def] of Object.entries(mod)) {
                extraArity[`${ns}.${name}`] = [def.args ?? 0, def.returns ?? 0];
            }
        } catch { /* skip unloadable js files */ }
    }
    return extraArity;
}

function decompilePkg(pkgPath: string, key?: string): string {
    const base   = path.basename(pkgPath, path.extname(pkgPath));
    const outDir = path.join(path.dirname(pkgPath), base + '.decompiled');
    const tmpDir = outDir + '.tmp';

    fs.mkdirSync(tmpDir, { recursive: true });
    try {
        const files = unpackProject(pkgPath, tmpDir, key);

        const jsFiles  = files.filter(f => path.extname(f) === '.js');
        const binFiles = files.filter(f => path.extname(f) === '.slasmbin' || path.extname(f) === '.slasmz');
        const allImports: { path: string; namespace: string }[] = [];
        for (const bin of binFiles) {
            try {
                let buff = fs.readFileSync(bin);
                if (path.extname(bin) === '.slasmz') buff = zlib.inflateSync(buff);
                const [,,,, imports = []] = SLASMBin.unpack(buff);
                allImports.push(...imports);
            } catch { /* skip */ }
        }
        const extraArity = loadJsArity(jsFiles, allImports);

        fs.mkdirSync(outDir, { recursive: true });
        for (const f of files) {
            const rel  = path.relative(tmpDir, f);
            const dest = path.join(outDir, rel);
            const ext  = path.extname(f);
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            if (ext === '.slasmbin' || ext === '.slasmz') {
                let buff = fs.readFileSync(f);
                if (ext === '.slasmz') buff = zlib.inflateSync(buff);
                const src = decompile(SLASMBin.unpack(buff), extraArity);
                const out = dest.replace(/\.(slasmbin|slasmz)$/, '.slasm');
                fs.writeFileSync(out, src, 'utf-8');
            } else {
                fs.copyFileSync(f, dest);
            }
        }
    } catch (e) {
        removeDirSync(tmpDir);
        throw e;
    }
    removeDirSync(tmpDir);

    return outDir;
}

export default function decompile(parsed: ParsedSLASM, extraArity: Record<string, [number, number]> = {}): string {
    const [instructions, labels, comments = [], exports = [], imports = []] = parsed;

    const importLines = imports.map(i => i.key ? `;+${i.path}:${i.key}:${i.namespace}+;` : `;+${i.path}:${i.namespace}+;`);

    const labelAtIp = new Map<number, string>();
    for (const lbl of labels) labelAtIp.set(lbl.ip, lbl.name);

    const exportAtIp = new Map<number, ExportEntry>();
    for (const e of exports) exportAtIp.set(e.ip, e);

    const emittedLabels = new Set<number>();
    const commentAtIp   = new Map<number, string>();
    for (const c of comments) commentAtIp.set(c.ip, c.text);

    const exprStack: string[] = [];
    const output:    string[] = [];
    let statementStartIp = 1;
    let i = 0;

    const exportsSorted = [...exportAtIp.values()].sort((a, b) => a.ip - b.ip);
    function returnsAtIp(ip: number): number {
        let result = 0;
        for (const e of exportsSorted) {
            if (e.ip <= ip) result = e.returns;
            else break;
        }
        return result;
    }

    const maybeEmitLabel = (ip: number) => {
        if (labelAtIp.has(ip) && !emittedLabels.has(ip)) {
            const exp = exportAtIp.get(ip);
            output.push(exp ? `;=${exp.name}:${exp.args}:${exp.returns}=;` : `;-${labelAtIp.get(ip)}-;`);
            emittedLabels.add(ip);
        }
    };

    while (i < instructions.length) {
        const op = String(instructions[i]);

        if (exprStack.length === 0) statementStartIp = i + 1;

        if (op === 'push') {
            exprStack.push(lit(String(instructions[i + 1])));
            i += 2;
            continue;
        }

        const arity = op === 'ret'
            ? [returnsAtIp(i + 1), 0] as [number, number]
            : ARITY[op] ?? extraArity[op];

        if (arity === undefined) {
            maybeEmitLabel(statementStartIp);
            while (exprStack.length > 0) output.push(exprStack.shift()!);
            output.push(`(${op})`);
            i++;
            continue;
        }

        const [consumed, produced] = arity;

        let args: string[];
        if (consumed === -1) {
            args = [...exprStack];
            exprStack.length = 0;
        } else {
            args = [];
            for (let j = 0; j < consumed; j++) {
                const val = exprStack.pop();
                if (val !== undefined) args.unshift(val);
            }
        }

        const expr = args.length > 0 ? `(${op} ${args.join(' ')})` : `(${op})`;

        if (produced > 0) {
            exprStack.push(expr);
        } else {
            for (let ip = statementStartIp; ip <= i + 1; ip++) maybeEmitLabel(ip);
            while (exprStack.length > 0) output.push(exprStack.shift()!);
            const comment = commentAtIp.get(i + 1);
            output.push(comment ? `${expr} ;${comment};` : expr);
        }

        i++;
    }

    if (exprStack.length > 0) {
        output.push(';orphaned-stack-items:;');
        for (const item of exprStack) output.push(item);
    }

    for (const [ip, name] of labelAtIp) {
        if (!emittedLabels.has(ip)) {
            if (ip === instructions.length + 1) {
                const exp = exportAtIp.get(ip);
                output.push(exp ? `;=${exp.name}:${exp.args}:${exp.returns}=;` : `;-${name}-;`);
            } else {
                output.push(`;unplaced-label-${name}-at-ip-${ip};`);
            }
        }
    }

    return [...importLines, ...output].join('\n');
}
