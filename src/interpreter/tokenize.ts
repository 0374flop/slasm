import logger from "../simpledegugger.js";

export default function tokenize(program: string): string[] {
    logger.log('begin tokenize: ', program);
    let acumulator: string = '';
    let tokens: Array<string> = [];
    for (let i = 0; i < program.length; i++) {
        const token: string = program[i];
        if ('() \n\t\r'.includes(token)) {
            if (acumulator !== '') {
                tokens.push(acumulator);
                acumulator = '';
            }
            if ('()'.includes(token)) tokens.push(token);
        } else {
            acumulator = acumulator+token;
        }
    }
    if (acumulator !== '') {
        tokens.push(acumulator);
    }

    logger.log('end tokenize: ', program, ',', tokens);
    return tokens;
}