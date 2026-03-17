import logger from "../simpledegugger.js";
import throw_ from "../throw_.js";

export type label = {
    ip: number,
    name: string
}

export default function parse(tokens: string[]): [string[], label[], string[]] {
    logger.log('begin parse', tokens);
    const instructions: string[] = [];
    const operatorstack: string[] = [];
    const labels: label[] = [];
    const comments: string[] = [];

    while (tokens.length > 0) {
        const token = tokens.shift()!;

        if (token === '(') {
            operatorstack.push(tokens.shift()!);
        } else if (token === ')') {
            instructions.push(operatorstack.pop()!);
        } else if (token[0] == ';' && token[token.length - 1] == ';') {
            const comment = token.slice(1, token.length - 1)
            if (comment[0] == '-' && comment[comment.length - 1] == '-') {
                const label = { ip: instructions.length, name: comment.slice(1, token.length - 1) }
                labels.push(label);
                logger.log('label: "'+label.name+'"', 'ip:', label.ip);
            } else {
                comments.push(comment);
                logger.log('comment:', comment);
            }
        } else {
            instructions.push('push', token);
        }
    }

    if (operatorstack.length > 0) throw_('Syntax', "Unclosed '('");

    logger.log('end parse', instructions);
    return [instructions, labels, comments];
}