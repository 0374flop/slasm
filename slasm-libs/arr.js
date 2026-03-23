const SEP = '\x1f';

const toArr = (s) => s === '' ? [] : s.split(SEP);
const fromArr = (a) => a.join(SEP);

module.exports = {
    new:     { args: 0, returns: 1, fn: ()          => [''] },
    push:    { args: 2, returns: 1, fn: ([a, v])    => { const r = toArr(a); r.push(v);          return [fromArr(r)]; } },
    pop:     { args: 1, returns: 2, fn: ([a])        => { const r = toArr(a); const v = r.pop() ?? ''; return [fromArr(r), v]; } },
    unshift: { args: 2, returns: 1, fn: ([a, v])    => { const r = toArr(a); r.unshift(v);       return [fromArr(r)]; } },
    shift:   { args: 1, returns: 2, fn: ([a])        => { const r = toArr(a); const v = r.shift() ?? ''; return [fromArr(r), v]; } },
    get:     { args: 2, returns: 1, fn: ([a, i])    => [toArr(a)[Number(i)] ?? ''] },
    set:     { args: 3, returns: 1, fn: ([a, i, v]) => { const r = toArr(a); r[Number(i)] = v;  return [fromArr(r)]; } },
    len:     { args: 1, returns: 1, fn: ([a])        => [String(toArr(a).length)] },
    del:     { args: 2, returns: 1, fn: ([a, i])    => { const r = toArr(a); r.splice(Number(i), 1); return [fromArr(r)]; } },
    insert:  { args: 3, returns: 1, fn: ([a, i, v]) => { const r = toArr(a); r.splice(Number(i), 0, v); return [fromArr(r)]; } },
    slice:   { args: 3, returns: 1, fn: ([a, s, e]) => [fromArr(toArr(a).slice(Number(s), Number(e)))] },
    concat:  { args: 2, returns: 1, fn: ([a, b])    => [fromArr([...toArr(a), ...toArr(b)])] },
    index:   { args: 2, returns: 1, fn: ([a, v])    => [String(toArr(a).indexOf(v))] },
    has:     { args: 2, returns: 1, fn: ([a, v])    => [String(toArr(a).includes(v))] },
    rev:     { args: 1, returns: 1, fn: ([a])        => [fromArr(toArr(a).reverse())] },
    join:    { args: 2, returns: 1, fn: ([a, sep])  => [toArr(a).join(sep)] },
    from:    { args: 2, returns: 1, fn: ([s, sep])  => [fromArr(s.split(sep))] },
};
