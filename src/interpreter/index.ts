import path from 'node:path';
import parse from './parse.js';
import tokenize from './tokenize.js';
import evaluate from './evaluate.js';
import logger from '../output.js';
import SLASMBin from '../tools/packunpack.js';

function eval_slasm(program: string, filepath?: string) {
    const tokens = tokenize(program);
    const result = parse(tokens);
    const basedir = filepath ? path.dirname(path.resolve(filepath)) : process.cwd();
    return evaluate(result.instructions, result.labels, result.directives, [], result.imports, basedir);
}

const slasm = {
    parse,
    logger,
    tokenize,
    evaluate,
    SLASMBin,
    eval_slasm
}
export default slasm;
