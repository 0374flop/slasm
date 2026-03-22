import type { label, directive } from './types.js';

export type VM = {
    namespace:    string;
    instructions: string[];
    labels:       label[];
    stack:        string[];
    memory:       Map<number, string>;
    ip:           number;
    directives:   directive[];
};

export type CallFrame = {
    namespace: string;
    ip:        number;
};

export type Runtime = {
    modules:   Map<string, VM>;
    clog:      string[];
    callstack: CallFrame[];
    current:   string;
};

export function createVM(
    namespace:    string,
    instructions: string[],
    labels:       label[],
    directives:   directive[] = []
): VM {
    return {
        namespace,
        instructions,
        labels,
        stack:     [],
        memory:    new Map(),
        ip:        0,
        directives,
    };
}

export function createRuntime(
    instructions: string[],
    labels:       label[],
    directives:   directive[] = []
): Runtime {
    const master = createVM('master', instructions, labels, directives);
    return {
        modules:   new Map([['master', master]]),
        clog:      [],
        callstack: [],
        current:   'master',
    };
}
