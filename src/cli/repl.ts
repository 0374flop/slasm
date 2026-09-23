import readline from 'node:readline';
import slasm, { comment, label } from '../interpreter/index.js';
import { SlasmError } from '../interpreter/errors.js';

const formatError = (error: unknown): string =>
    error instanceof SlasmError ? error.format() : error instanceof Error ? error.message : String(error);

export default async function repl(): Promise<void> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const ask = () => new Promise<string>((resolve) => rl.question('> ', resolve));

    while (true) {
        const code = await ask();
        if (!code || code.trim().toLowerCase() === '.exit' || code.trim().toLowerCase() === 'exit') {
            console.log('exited');
            rl.close();
            process.exit();
        }

        let compiled: [string[], label[], comment[]];
        try {
            compiled = slasm.compile(code);
        } catch (error) {
            console.log(formatError(error));
            continue;
        }
        const proc = slasm.evaluate(compiled[0], compiled[1]);

        proc.on('output', (value) => process.stdout.write(`${value}\n`));
        proc.on('error', (err) => console.log(formatError(err)));
        proc.on('input', (reply) => {
            rl.question('', (line) => reply(line));
        });

        try {
            await proc.result;
            if (proc.stack && proc.stack.length === 1) {
                console.log(proc.stack[0]);
            }
        } catch (error) {
            console.log(formatError(error));
        }
    }
}

