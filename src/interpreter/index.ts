import parse from './parse.js';
import tokenize from './tokenize.js';
import evaluate from './evaluate.js';
import logger from '../output.js';

export type { ParseResult, label, comment } from './types.js';
export type { Runtime, CallFrame } from './vm.js';
export { SlasmProcess } from './process.js';

function eval_slasm(program: string, inputQueue: string[] | null = null) {
    const result = parse(tokenize(program));
    return evaluate(result.instructions, result.labels, [], inputQueue);
}

const slasm = {
    parse,
    logger,
    tokenize,
    evaluate,
    eval_slasm,
};

export default slasm;
