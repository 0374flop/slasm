import * as Types from './types'

export default function parse(tokens: string[]): Types.ParseResult {
    const instructions: string[] = [];
    const operatorstack: string[] = [];
    const labels: Types.label[]   = [];
    const comments: Types.comment[] = [];

    let pos = 0;

    while (pos < tokens.length) {
        const token = tokens[pos++];

        if (token === '(') {
            if (pos >= tokens.length) throw new SyntaxError("Unclosed '('");
            const opToken = tokens[pos++];
            if (opToken === ')' || opToken === '(') {
                throw new SyntaxError("Missing operator token after '('");
            }
            operatorstack.push(opToken);
            continue;
        }

        if (token === ')') {
            if (operatorstack.length === 0) {
                throw new SyntaxError("Unexpected ')'");
            }
            instructions.push(operatorstack.pop()!);
            continue;
        }

        if (token.length >= 2 && token[0] === ';' && token[token.length - 1] === ';') {
            const inner = token.slice(1, token.length - 1);

            if (inner.length >= 2 && inner[0] === '-' && inner[inner.length - 1] === '-') {
                const labelName = inner.slice(1, inner.length - 1);
                if (labelName === '') {
                    throw new SyntaxError("Empty label name in ';- -;' block");
                }
                labels.push({ ip: instructions.length + 1, name: labelName });
            } else {
                comments.push({ ip: instructions.length + 1, text: inner });
            }

            continue;
        }

        instructions.push('push', token);
    }

    if (operatorstack.length > 0) throw new SyntaxError("Unclosed '('");

    return { instructions, labels, comments };
}
