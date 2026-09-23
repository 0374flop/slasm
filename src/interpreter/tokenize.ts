const WHITESPACE = ' \n\t\r';

export default function tokenize(program: string): string[] {
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
            let block = ';';
            let j = i + 1;
            let isValid = false;

            while (j < program.length) {
                const c = program[j];
                if (c === '(' || c === ')' || WHITESPACE.includes(c)) {
                    break;
                }
                if (c === ';') {
                    block += ';';
                    isValid = true;
                    break;
                }
                block += c;
                j++;
            }

            if (isValid) {
                tokens.push(block);
                i = j + 1;
                continue;
            }
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

    return tokens;
}
