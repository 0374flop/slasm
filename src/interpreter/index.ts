import parse from './parse.js';
import tokenize from './tokenize.js';
import evaluate from './evaluate.js';
import decompile from './decompile.js';
import logger from '../output.js';
import type { label, comment } from './types.js';

export type { ParseResult, label, comment } from './types.js';
export type { Runtime } from './vm.js';
export { SlasmProcess } from './process.js';

function eval_slasm(program: string, inputQueue: string[] | null = null) {
    const result = parse(tokenize(program));
    return evaluate(result.instructions, result.labels, [], inputQueue);
}

function compile(program: string): [string[], label[], comment[]] {
    const result = parse(tokenize(program));
    return [result.instructions, result.labels, result.comments];
}

function format(program: string): string {
    const [instructions, labels, comments] = compile(program);
    return decompile(instructions, labels, comments);
}

const slasm = {
    parse,
    logger,
    tokenize,
    evaluate,
    decompile,
    compile,
    format,
    eval_slasm,
};

export default slasm;
