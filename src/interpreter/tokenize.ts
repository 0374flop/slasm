import logger from "../output.js";

export default function tokenize(program: string): string[] {
    logger.log('begin tokenize: ', program);
    let accumulator: string = '';
    let tokens: Array<string> = [];
    let i = 0;

    while (i < program.length) {
        const char = program[i];

        if (char === ';') {
            if (accumulator !== '') {
                tokens.push(accumulator);
                accumulator = '';
            }
            let block = ';';
            i++;
            while (i < program.length && program[i] !== ';') {
                block += program[i];
                i++;
            }
            block += ';';
            tokens.push(block);
            i++;
            continue;
        }

        if (char === '"' || char === "'" || char === '`') {
            if (accumulator !== '') {
                tokens.push(accumulator);
                accumulator = '';
            }
            const quote = char;
            let str = '';
            i++;
            while (i < program.length && program[i] !== quote) {
                str += program[i];
                i++;
            }
            tokens.push(str);
            i++;
            continue;
        }

        if ('() \n\t\r'.includes(char)) {
            if (accumulator !== '') {
                tokens.push(accumulator);
                accumulator = '';
            }
            if ('()'.includes(char)) tokens.push(char);
        } else {
            accumulator += char;
        }

        i++;
    }

    if (accumulator !== '') {
        tokens.push(accumulator);
    }

    logger.log('end tokenize: ', program, ',', tokens);
    return tokens;
}