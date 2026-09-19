import logger from "../output.js";

const WHITESPACE = ' \n\t\r';

export default function tokenize(program: string): string[] {
    logger.log('begin tokenize: ', program);
    let accumulator: string = '';
    let tokens: Array<string> = [];
    let i = 0;
    let line = 1;

    const flush = () => {
        if (accumulator !== '') {
            tokens.push(accumulator);
            accumulator = '';
        }
    };

    while (i < program.length) {
        const char = program[i];

        if (char === ';') {
            flush();
            const startLine = line;
            let block = ';';
            i++;
            while (i < program.length && program[i] !== ';') {
                const c = program[i];
                if (WHITESPACE.includes(c)) {
                    throw new SyntaxError(`line ${startLine}: whitespace inside ';...;' block`);
                }
                block += c;
                i++;
            }
            if (i >= program.length) {
                throw new SyntaxError(`line ${startLine}: unclosed ';' block`);
            }
            block += ';';
            tokens.push(block);
            i++;
            continue;
        }

        if (WHITESPACE.includes(char)) {
            flush();
            if (char === '\n') line++;
        } else if (char === '(' || char === ')') {
            flush();
            tokens.push(char);
        } else {
            accumulator += char;
        }

        i++;
    }

    flush();

    logger.log('end tokenize: ', program, ',', tokens);
    return tokens;
}
