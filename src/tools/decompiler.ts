import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import SLASMBin, { type ParsedSLASM, type ExportEntry, type ImportEntry, type InlineModule } from './packunpack';
import { isEncrypted, decrypt } from './encrypt';

const ARITY: Record<string, [number, number]> = {
    'clog':       [1, 0],
    'cnum':       [0, 1],
    'cchan':      [2, 0],
    'cget':       [1, 1],
    'q':          [0, 1],
    'W':          [2, 0],
    'R':          [1, 1],
    '~':          [2, 1],
    'JOIN':       [-1, 1],
    'rep':        [2, 1],
    'char':       [2, 1],
    'L':          [2, 1],
    'gln':        [1, 1],
    '+':          [2, 1],
    '-':          [2, 1],
    '*':          [2, 1],
    '/':          [2, 1],
    '=':          [2, 1],
    '<':          [2, 1],
    '>':          [2, 1],
    '!':          [1, 1],
    'jump':       [1, 0],
    '?':          [2, 0],
    'call':       [1, 0],
    'ret':        [0, 0],
    'csnum':      [0, 1],
    'S':          [1, 1],
    'getstack':   [1, 1],
    'cstack':     [2, 0],
    '_':          [0, 1],
    'clearstack': [0, 0],
    'i':          [0, 1],
    'inum':       [0, 1],
    'iget':       [1, 1],
    'SO':         [2, 0],
    '?*':         [2, 1],
    'begin':      [0, 0],
    'none':       [0, 0],
    'wait':       [1, 0],
    'throw':      [1, 0],
};

function extractJsArity(source: string): Record<string, [number, number]> {
    const result: Record<string, [number, number]> = {};
    const nameRegex = /(\w+)\s*:/g;
    let m: RegExpExecArray | null;
    while ((m = nameRegex.exec(source)) !== null) {
        const name = m[1];
        const rest = source.slice(m.index + m[0].length).trimStart();
        if (!rest.startsWith('{')) continue;
        let depth = 0, j = 0, blockEnd = -1;
        for (; j < rest.length; j++) {
            if (rest[j] === '{') depth++;
            else if (rest[j] === '}') { depth--; if (depth === 0) { blockEnd = j; break; } }
        }
        if (blockEnd === -1) continue;
        const block = rest.slice(0, blockEnd + 1);
        const argsM = block.match(/\bargs\s*:\s*(\d+)/);
        const retM  = block.match(/\breturns\s*:\s*(\d+)/);
        if (argsM && retM) result[name] = [Number(argsM[1]), Number(retM[1])];
    }
    return result;
}

function collectExtraArity(inlineModules: InlineModule[]): Record<string, [number, number]> {
    const result: Record<string, [number, number]> = {};
    for (const m of inlineModules) {
        if (m.type === 'slasm') {
            for (const e of m.exports) {
                result[`${m.namespace}.${e.name}`] = [e.args, e.returns];
                result[e.name] = [e.args, e.returns];
            }
        } else {
            for (const [name, arity] of Object.entries(extractJsArity(m.source))) {
                result[`${m.namespace}.${name}`] = arity;
                result[name] = arity;
            }
        }
    }
    return result;
}

function lit(val: string): string {
    if (val.startsWith('(')) return val;
    if (val.includes(' ')) return `"${val}"`;
    return val;
}

export function decompileFile(filepath: string, key?: string): string {
    const p = path.normalize(filepath);
    if (!fs.existsSync(p)) throw new Error(`no such file: ${p}`);
    const ext = path.extname(p);

    if (ext === '.slasmbin' || ext === '.slasmz') {
        let buff = fs.readFileSync(p);
        if (isEncrypted(buff)) {
            if (!key) throw new Error('file is encrypted, provide --key');
            buff = decrypt(buff, key);
        }
        if (ext === '.slasmz') buff = zlib.inflateSync(buff);
        const parsed = SLASMBin.unpack(buff);
        const [code, labels, comments, exports, , inlineModules] = parsed;
        const extraArity = inlineModules ? collectExtraArity(inlineModules) : {};

        if (inlineModules && inlineModules.length > 0) {
            const baseName = path.basename(p, ext);
            const outDir   = path.join(path.dirname(p), baseName + '.decompiled');
            if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

            const importEntries: ImportEntry[] = [];

            for (const m of inlineModules) {
                if (m.type === 'slasm') {
                    const src = decompile([m.instructions.map(String), m.labels, [], m.exports], extraArity);
                    const outPath = path.join(outDir, m.namespace + '.slasm');
                    fs.writeFileSync(outPath, src, { encoding: 'utf-8' });
                    importEntries.push({ path: './' + m.namespace, namespace: m.namespace });
                } else {
                    const outPath = path.join(outDir, m.namespace + '.js');
                    fs.writeFileSync(outPath, m.source, { encoding: 'utf-8' });
                    importEntries.push({ path: './' + m.namespace + '.js', namespace: m.namespace });
                }
            }

            const importLines = importEntries.map(i => `;+${i.path}:${i.namespace}+;`).join('\n');
            const mainSrc = importLines + '\n\n' + decompile([code.map(String), labels, comments, exports ?? []], extraArity);
            const mainPath = path.join(outDir, baseName + '.slasm');
            fs.writeFileSync(mainPath, mainSrc, { encoding: 'utf-8' });
            return outDir;
        }

        return decompile(parsed, extraArity);
    } else if (ext === '.slasmjson') {
        return decompile(JSON.parse(fs.readFileSync(p, { encoding: 'utf-8' })));
    } else {
        throw new Error(`decompile supports: .slasmjson, .slasmbin, .slasmz`);
    }
}

export default function decompile(parsed: ParsedSLASM, extraArity: Record<string, [number, number]> = {}): string {
    const [instructions, labels, , exports = []] = parsed;

    const labelAtIp = new Map<number, string>();
    for (const lbl of labels) {
        labelAtIp.set(lbl.ip, lbl.name);
    }

    const exportAtIp = new Map<number, ExportEntry>();
    for (const e of exports) {
        exportAtIp.set(e.ip, e);
    }

    const emittedLabels = new Set<number>();

    const exprStack: string[] = [];
    const output: string[] = [];
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
            if (exp) {
                output.push(`;=${exp.name}:${exp.args}:${exp.returns}=;`);
            } else {
                output.push(`;-${labelAtIp.get(ip)}-;`);
            }
            emittedLabels.add(ip);
        }
    };

    while (i < instructions.length) {
        const op = String(instructions[i]);

        if (exprStack.length === 0) {
            statementStartIp = i + 1;
        }

        if (op === 'push') {
            const val = String(instructions[i + 1]);
            exprStack.push(lit(val));
            i += 2;
            continue;
        }

        const arity = op === 'ret'
            ? [returnsAtIp(i + 1), 0] as [number, number]
            : ARITY[op] ?? extraArity[op];

        if (arity === undefined) {
            maybeEmitLabel(statementStartIp);
            while (exprStack.length > 0) {
                output.push(exprStack.shift()!);
            }
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

        const expr = args.length > 0
            ? `(${op} ${args.join(' ')})`
            : `(${op})`;

        if (produced > 0) {
            exprStack.push(expr);
        } else {
            for (let ip = statementStartIp; ip <= i + 1; ip++) maybeEmitLabel(ip);
            while (exprStack.length > 0) output.push(exprStack.shift()!);
            output.push(expr);
        }

        i++;
    }

    if (exprStack.length > 0) {
        output.push(';orphaned-stack-items:;');
        for (const item of exprStack) {
            output.push(item);
        }
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

    return output.join('\n');
}