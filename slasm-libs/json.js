module.exports = {
    parse:     { args: 1, returns: 1, fn: ([s]) => [JSON.parse(s)] },
    stringify: { args: 1, returns: 1, fn: ([x]) => [JSON.stringify(x)] },
    pretty:    { args: 1, returns: 1, fn: ([x]) => [JSON.stringify(x, null, 2)] },
    get:       { args: 2, returns: 1, fn: ([obj, key]) => {
        const parsed = typeof obj === 'string' ? JSON.parse(obj) : obj;
        return [parsed[key]];
    }},
    set:       { args: 3, returns: 1, fn: ([obj, key, val]) => {
        const parsed = typeof obj === 'string' ? JSON.parse(obj) : { ...obj };
        parsed[key] = val;
        return [JSON.stringify(parsed)];
    }},
    valid:     { args: 1, returns: 1, fn: ([s]) => {
        try { JSON.parse(s); return [1]; } catch { return [0]; }
    }},
};
