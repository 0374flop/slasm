import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import slasm from '../../lib/interpreter/index.js';
import { optimize } from '../../lib/optimizer/optimize.js';

const codeDir = path.resolve(__dirname, '../../slasm-code');

function files(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) return files(file);
        return entry.isFile() && entry.name.endsWith('.slasm') ? [file] : [];
    });
}

function elapsed(start: number): string {
    return `${(performance.now() - start).toFixed(3)} ms`;
}

async function execute(source: string): Promise<{ output: string[]; time: string }> {
    const originalClog = slasm.logger.clog;
    slasm.logger.clog = () => {};
    const start = performance.now();
    try {
        const process = slasm.eval_slasm(source, []);
        process.on('error', () => {});
        const output = await process.result;
        return { output, time: elapsed(start) };
    } finally {
        slasm.logger.clog = originalClog;
    }
}

async function benchmark(file: string): Promise<void> {
    const source = fs.readFileSync(file, 'utf8');
    const name = path.relative(codeDir, file);
    const parseStart = performance.now();
    const parsed = slasm.parse(slasm.tokenize(source));
    const parseTime = elapsed(parseStart);
    const execution = await execute(source);
    const optimizeStart = performance.now();
    const optimized = await optimize(source, []);
    const optimizeTime = elapsed(optimizeStart);
    const optimizedParsed = slasm.parse(slasm.tokenize(optimized.source));

    console.log(name);
    if (source.split(/\r?\n/).length <= 100) {
        console.log('  source:');
        console.log(source);
        console.log('  optimized:');
        console.log(optimized.source);
    }
    console.log(`  output: ${JSON.stringify(execution.output)}`);
    console.log(`  parse: ${parseTime}`);
    console.log(`  execute: ${execution.time}`);
    console.log(`  optimize: ${optimizeTime}`);
    console.log(`  bytes: ${Buffer.byteLength(source)} -> ${Buffer.byteLength(optimized.source)}`);
    console.log(`  instructions: ${parsed.instructions.length} -> ${optimizedParsed.instructions.length}`);
    console.log(`  optimizer: ${optimized.log.join('; ')}`);
}

async function main(): Promise<void> {
    for (const file of files(codeDir)) {
        try {
            await benchmark(file);
        } catch (error) {
            console.log(path.relative(codeDir, file));
            console.log(`  error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

void main();
