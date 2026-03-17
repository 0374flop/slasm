import logger from "../simpledegugger.js";
import { label } from "./parse.js";
import ri, { type State } from "./runinstruction.js";

export default function evaluate(instructions: string[] = [], clog: string[] = [], labels: label[] = []): string[] {
    logger.warn('evaluate start');
    const state: State = {
        instructions,
        stack: [],
        ip: 0,
        clog,
        memory: new Map(),
        labels: labels,
    };
    while (state.ip < state.instructions.length) {
        ri.run_instruction(state);
    }
    logger.warn('evaluate end');
    return state.clog;
}