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
}

export type ParseResult = {
    instructions: string[];
    labels:       label[];
    comments:     comment[];
    directives:   directive[];
    exports:      exportDef[];
    imports:      importDef[];
}

function parseInner(content: string): string[] {
    return content.split(':');
}

export default function parse(tokens: string[]): ParseResult {
    const instructions: string[] = [];
    const operatorstack: string[] = [];
    const labels:     label[]     = [];
    const comments:   comment[]   = [];
    const directives: directive[] = [];
    const exports:    exportDef[] = [];
    const imports:    importDef[] = [];

    while (tokens.length > 0) {
        const token = tokens.shift()!;

        if (token === '(') {
            operatorstack.push(tokens.shift()!);
            continue;
        }

        if (token === ')') {
            instructions.push(operatorstack.pop()!);
            continue;
        }

        if (token[0] === ';' && token[token.length - 1] === ';') {
            const inner = token.slice(1, token.length - 1);
            const marker = inner[0];
            const markerEnd = inner[inner.length - 1];
            const ip = instructions.length + 1;

            if (marker === '-' && markerEnd === '-') {
                // ;-name-; / ;-name:args:returns-;
                const body = inner.slice(1, inner.length - 1);
                const parts = parseInner(body);
                if (parts.length === 3) {
                    // ;-name:2:1-;
                    labels.push({ ip, name: parts[0] });
                } else {
                    labels.push({ ip, name: body });
                }

            } else if (marker === '=' && markerEnd === '=') {
                // ;=name:args:returns=;
                const body = inner.slice(1, inner.length - 1);
                const parts = parseInner(body);
                if (parts.length === 3) {
                    exports.push({
                        ip,
                        name:    parts[0],
                        args:    Number(parts[1]),
                        returns: Number(parts[2]),
                    });
                    labels.push({ ip, name: parts[0] });
                } else {
                    // ;=name=;
                    exports.push({ ip, name: body, args: 0, returns: 0 });
                    labels.push({ ip, name: body });
                }

            } else if (marker === '+' && markerEnd === '+') {
                // ;+./path:namespace+; / ;+./path+;
                const body = inner.slice(1, inner.length - 1).trim();
                const colonIdx = body.lastIndexOf(':');
                if (colonIdx !== -1) {
                    imports.push({
                        path:      body.slice(0, colonIdx).trim(),
                        namespace: body.slice(colonIdx + 1).trim(),
                    });
                } else {
                    const ns = body.trim().split('/').pop()?.replace(/\.\w+$/, '') ?? body;
                    imports.push({ path: body.trim(), namespace: ns });
                }

            } else if (marker === '!' && markerEnd === '!') {
                // ;!name!; / ;!name:value1:value2!;
                const body = inner.slice(1, inner.length - 1).trim();
                const parts = parseInner(body);
                directives.push({
                    name:   parts[0],
                    values: parts.slice(1),
                });

            } else {
                comments.push({ ip, text: inner });
            }

            continue;
        }

        instructions.push('push', token);
    }

    if (operatorstack.length > 0) throw new SyntaxError("Unclosed '('");

    return { instructions, labels, comments, directives, exports, imports };
}