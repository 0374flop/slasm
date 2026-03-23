const fs = require('fs')
// Нативный JS модуль для SLASM
// Каждый экспорт: { args, returns, fn }
const fn = ([vaule]) => {
    fs.writeFileSync('testttttttt', vaule)
}
module.exports = {
    file: {
        args: 1, returns: 0, fn: fn
    },
    // Строки
    upper: {
        args: 1, returns: 1,
        fn: ([s]) => [s.toUpperCase()]
    },
    lower: {
        args: 1, returns: 1,
        fn: ([s]) => [s.toLowerCase()]
    },
    strlen: {
        args: 1, returns: 1,
        fn: ([s]) => [String(s.length)]
    },
    trim: {
        args: 1, returns: 1,
        fn: ([s]) => [s.trim()]
    },
    includes: {
        args: 2, returns: 1,
        fn: ([haystack, needle]) => [String(haystack.includes(needle))]
    },
    replace: {
        args: 3, returns: 1,
        fn: ([s, from, to]) => [s.replaceAll(from, to)]
    },

    // Числа
    pow: {
        args: 2, returns: 1,
        fn: ([base, exp]) => [String(Math.pow(Number(base), Number(exp)))]
    },
    sqrt: {
        args: 1, returns: 1,
        fn: ([n]) => [String(Math.sqrt(Number(n)))]
    },
    floor: {
        args: 1, returns: 1,
        fn: ([n]) => [String(Math.floor(Number(n)))]
    },
    ceil: {
        args: 1, returns: 1,
        fn: ([n]) => [String(Math.ceil(Number(n)))]
    },
    round: {
        args: 1, returns: 1,
        fn: ([n]) => [String(Math.round(Number(n)))]
    },
    rand: {
        args: 0, returns: 1,
        fn: () => [String(Math.random())]
    },

    // Время
    now: {
        args: 0, returns: 1,
        fn: () => [String(Date.now())]
    },
    timestamp: {
        args: 0, returns: 1,
        fn: () => [new Date().toISOString()]
    },
};
