export type label = {
    ip:   number;
    name: string;
}

export type comment = {
    ip:   number;
    text: string;
}

export type directive = {
    name:   string;
    values: string[];
}

export type exportDef = {
    ip:      number;
    name:    string;
    args:    number;
    returns: number;
}

export type importDef = {
    path:      string;
    namespace: string;
    key?:      string;
}

export type ParseResult = {
    instructions: string[];
    labels:       label[];
    comments:     comment[];
    directives:   directive[];
    exports:      exportDef[];
    imports:      importDef[];
}