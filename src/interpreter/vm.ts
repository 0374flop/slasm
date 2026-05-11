import type { label, directive, exportDef } from './types.js';
import type { SlasmProcess } from './process.js';

export type VM = {
    namespace:    string;
    instructions: string[];
    labels:       label[];
    exports:      exportDef[];
    stack:        string[];
    memory:       Map<string, string>;
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
    emitter:       SlasmProcess;
    events:        Map<string, string[]>;
    inputQueue:    string[] | null;
    killed:        boolean;
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
        memory:    new Map<string, string>(),
        ip:        0,
        directives,
    };
}

export function createRuntime(
    instructions: string[],
    labels:       label[],
    directives:   directive[] = [],
    exports:      exportDef[] = [],
    emitter:      SlasmProcess,
    inputQueue:   string[] | null = null,
): Runtime {
    const master = createVM('master', instructions, labels, directives, exports);
    return {
        modules:       new Map([['master', master]]),
        nativeModules: new Map(),
        clog:          [],
        callstack:     [],
        current:       'master',
        emitter,
        events:        new Map(),
        inputQueue,
        killed:        false,
    };
}
