import parse from './parse.js';
import tokenize from './tokenize.js';
import evaluate from './evaluate.js';
import logger from '../simpledegugger.js';
import ri from './runinstruction.js';

function eval_slasm(program: string) {
    const tokens = tokenize(program);
    const parseout = parse(tokens)
    return evaluate(parseout[0]);
}

const slasm = {
    ri,
    parse,
    logger,
    tokenize,
    evaluate,
    eval_slasm
}
export default slasm;