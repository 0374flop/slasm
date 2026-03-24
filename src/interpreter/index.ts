import path from 'node:path';
import parse from './parse.js';
import tokenize from './tokenize.js';
import preprocess from './preprocess.js';
import evaluate from './evaluate.js';
import logger from '../output.js';
import SLASMBin from '../tools/packunpack.js';
import run from '../tools/run.js';
import decompile, { decompileFile } from '../tools/decompiler.js';
import { encrypt, decrypt, encryptFile, decryptFile, isEncrypted } from '../tools/encrypt.js';

export type { ParsedSLASM, ExportEntry } from '../tools/packunpack.js';
export type { ParseResult, label, comment, directive, exportDef, importDef } from './types.js';
export type { VM, Runtime, CallFrame } from './vm.js';

function eval_slasm(program: string, filepath?: string) {
    const result = parse(tokenize(program));
    const instructions = preprocess(result.instructions);
    const basedir = filepath ? path.dirname(path.resolve(filepath)) : process.cwd();
    return evaluate(instructions, result.labels, result.directives, [], result.imports, basedir, result.exports);
}

const slasm = {
    parse,
    preprocess,
    logger,
    tokenize,
    evaluate,
    SLASMBin,
    eval_slasm,
    run,
    decompile,
    decompileFile,
    encrypt,
    decrypt,
    encryptFile,
    decryptFile,
    isEncrypted,
}
export default slasm;
