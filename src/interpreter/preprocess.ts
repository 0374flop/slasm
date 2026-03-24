export default function preprocess(instructions: string[]): string[] {
    const out: string[] = [];

    for (let i = 0; i < instructions.length; i++) {
        const instr = instructions[i];

        if (instr.startsWith('gv:')) {
            const name = instr.slice(3);
            out.push('push', name, 'R');
            continue;
        }

        if (instr.startsWith('sv:')) {
            const name = instr.slice(3);

            if (out.length >= 2 && out[out.length - 2] === 'push') {
                const val = out.pop()!;
                out.pop();

                if (val === '++') {
                    out.push('push', name, 'push', name, 'R', 'push', '1', '+', 'W');
                } else if (val === '--') {
                    out.push('push', name, 'push', name, 'R', 'push', '1', '-', 'W');
                } else {
                    out.push('push', name, 'push', val, 'W');
                }
            } else {
                out.push('push', name, 'swap', 'W');
            }
            continue;
        }

        out.push(instr);
    }

    return out;
}
