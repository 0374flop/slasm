import * as Types from './types'

export default function parse(tokens: string[]): Types.ParseResult {
    const instructions: string[] = [];
    const operatorstack: string[] = [];
    const labels:   Types.label[]   = [];
    const comments: Types.comment[] = [];

    while (tokens.length > 0) {
        const token = tokens.shift()!;

        if (token === '(') {
            operatorstack.push(tokens.shift()!);
            continue;
        }

        if (token === ')') {
            instructions.push(operatorstack.pop()!);
            continue;
        }

        if (token[0] === ';' && token[token.length - 1] === ';') {
            const inner = token.slice(1, token.length - 1);

            if (inner[0] === '-' && inner[inner.length - 1] === '-') {
                labels.push({ ip: instructions.length + 1, name: inner.slice(1, inner.length - 1) });
            } else {
                comments.push({ ip: instructions.length, text: inner });
            }

            continue;
        }

        instructions.push('push', token);
    }

    if (operatorstack.length > 0) throw new SyntaxError("Unclosed '('");

    return { instructions, labels, comments };
}
