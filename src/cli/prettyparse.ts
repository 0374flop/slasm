import type { label, comment } from '../interpreter/types.js';

export default function prettyParse(instructions: string[], labels: label[], comments: comment[]): string {
    const lines: string[] = [];
    const labelAtIp = new Map<number, string>();
    const commentAtIp = new Map<number, string>();

    for (const lbl of labels) labelAtIp.set(lbl.ip, lbl.name);
    for (const c of comments) commentAtIp.set(c.ip, c.text);

    const width = String(instructions.length).length;
    const pad = (n: number) => String(n).padStart(width, ' ');

    let i = 0;
    while (i < instructions.length) {
        const ip = i + 1;
        const op = instructions[i];

        if (commentAtIp.has(ip)) {
            lines.push(`${' '.repeat(width + 2)}  ;${commentAtIp.get(ip)};`);
        }

        if (labelAtIp.has(ip)) {
            lines.push(`${'─'.repeat(width + 2)}  ;-${labelAtIp.get(ip)}-;`);
        }

        if (op === 'push' && i + 1 < instructions.length) {
            const val = instructions[i + 1];
            const next = instructions[i + 2];
            let annotation = '';
            if (next === 'jump') {
                const target = Number(val);
                const lbl = labelAtIp.get(target);
                annotation = lbl ? `  ──► ${target} (${lbl})` : `  ──► ${target}`;
            } else if (next === '?') {
                const target = Number(val);
                const lbl = labelAtIp.get(target);
                annotation = lbl ? `  ──► ${target} (${lbl}) if true` : `  ──► ${target} if true`;
            } else if (next === 'gln') {
                annotation = `  (label name)`;
            }
            lines.push(`${pad(ip)}  push  ${val}${annotation}`);
            i += 2;
            continue;
        }

        if (op === 'jump' || op === '?') {
            lines.push(`${pad(ip)}  ${op}`);
            i++;
            continue;
        }

        lines.push(`${pad(ip)}  ${op}`);
        i++;
    }

    for (const [ip, name] of labelAtIp) {
        if (ip > instructions.length) {
            lines.push(`${'─'.repeat(width + 2)}  ;-${name}-;  (past end @ ${ip})`);
        }
    }

    const out: string[] = [];
    out.push(`instructions: ${instructions.length}`);
    out.push('');
    out.push(...lines);

    if (labels.length > 0) {
        out.push('');
        out.push(`labels: ${labels.length}`);
        for (const lbl of labels) out.push(`  ${lbl.name.padEnd(16)}  @${lbl.ip}`);
    }

    if (comments.length > 0) {
        out.push('');
        out.push(`comments: ${comments.length}`);
        for (const c of comments) out.push(`  ;${c.text};`);
    }

    return out.join('\n');
}
