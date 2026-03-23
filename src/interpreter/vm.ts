import type { label, directive, exportDef } from './types.js';

export type VM = {
    namespace:    string;
    instructions: string[];
    labels:       label[];
    exports:      exportDef[];
    stack:        string[];
    memory:       Map<number, string>;
    ip:           number;
    directives:   directive[];
};

export type CallFrame = {
    namespace:  string;
    ip:         number;
    returns:    number;
    stackBase:  number;
};

export type NativeExport = {
    args:    number;
    returns: number;
    fn:      (args: string[]) => string[];
};

export type Runtime = {
    modules:       Map<string, VM>;
    nativeModules: Map<string, Map<string, NativeExport>>;
    clog:          string[];
    callstack:     CallFrame[];
    current:       string;
};

export function createVM(
    namespace:    string,
    instructions: string[],
    labels:       label[],
    directives:   directive[] = [],
    exports:      exportDef[] = [],
): VM {
    return {
        namespace,
        instructions,
        labels,
        exports,
        stack:     [],
        memory:    new Map(),
        ip:        0,
        directives,
    };
}

export function createRuntime(
    instructions: string[],
    labels:       label[],
    directives:   directive[] = [],
    exports:      exportDef[] = [],
): Runtime {
    const master = createVM('master', instructions, labels, directives, exports);
    return {
        modules:       new Map([['master', master]]),
        nativeModules: new Map(),
        clog:          [],
        callstack:     [],
        current:       'master',
    };
}
