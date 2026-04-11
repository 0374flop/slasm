import readline from 'node:readline';
import slasm from '../interpreter/index.js';

export default async function repl(): Promise<void> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const ask = () => new Promise<string>((resolve) => rl.question('> ', resolve));

    while (true) {
        const code = await ask();
        if (!code || code.toLowerCase() === 'exit') {
            console.log('--exit--');
            rl.close();
            process.exit();
        }

        const proc = slasm.eval_slasm(code);

        proc.on('input', (reply) => {
            rl.question('', (line) => reply(line));
        });

        try {
            await proc.result;
        } catch (error) {
            console.log(error instanceof Error ? error.message : error);
        }
    }
}
