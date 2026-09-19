import type { label } from './types.js';
import type { SlasmProcess } from './process.js';

export type CallFrame = {
    ip: number;
    returns: number;
    stackBase: number;
};

export type Runtime = {
    instructions: string[];
    labels: label[];
    stack: string[];
    memory: Map<number, string>;
    ip: number;
    callstack: CallFrame[];
    clog: string[];
    emitter: SlasmProcess;
    inputQueue: string[] | null;
};

export function createRuntime(
    instructions: string[],
    labels: label[],
    emitter: SlasmProcess,
    inputQueue: string[] | null = null,
): Runtime {
    return {
        instructions,
        labels,
        stack: [],
        memory: new Map<number, string>(),
        ip: 0,
        callstack: [],
        clog: [],
        emitter,
        inputQueue,
    };
}
