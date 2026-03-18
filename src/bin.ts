#!/usr/bin/env node
const [command, ...args] = process.argv.slice(2);
import slasm from "./interpreter";
import logger from "./simpledegugger";
import repl from "./repl";

if (args.find(arg => arg == 'debug')) {
    logger.enabled = true;
    logger.log('debug logs enabled');
}

if (command == 'eval') {
    const code = args.join(' ');
    slasm.eval_slasm(code);
} else if (command == 'repl') {
    while (true) repl();
} else if (command == 'debug') {
    logger.enabled = true;
    logger.log('debug logs enabled');
    while (true) repl();
} else if (command == 'parse') {
    const parsedata = slasm.parse(slasm.tokenize(args[0]));
    if (logger.enabled) {
        console.log(JSON.stringify(parsedata[0]));
        console.log(JSON.stringify(parsedata[1]));
        console.log(JSON.stringify(parsedata[2]));
    } else {
        const instr = parsedata[0].map((line, i) => `${i + 1}^ ${line}`).join("\n");
        const labels = parsedata[1].map((line, i) => `${i + 1}. ${line.name}^${line.ip}`).join('\n');
        const comments = parsedata[2].map((line, i) => `${i + 1}. ${line}`).join("\n");
        console.log(instr ? instr : '(none)');
        console.log(parsedata[0].length, '^', '------------');
        console.log(labels ? labels : '(none)');
        console.log(parsedata[1].length, '^', '------------');
        console.log(comments ? comments : '(none)');
        console.log(parsedata[2].length, '^', '------------');
    }
} else if (command == 'pack') {
    try {
        console.log(slasm.SLASMBin.packFile(args[0], args.includes('z')));
    } catch (e) {
        console.log(e instanceof Error ? e.message : e);
    }
} else if (command == 'unpack') {
    try {
        console.log(slasm.SLASMBin.unpackFile(args[0]));
    } catch (e) {
        console.log(e instanceof Error ? e.message : e);
    }
} else if (command == 'run') {
    const pathtofile = require('node:path').normalize(args[0]);
    const fs = require('node:fs');
    const zlib = require('node:zlib');
    if (fs.existsSync(pathtofile)) {
        const ext = require('node:path').extname(pathtofile);
        if (ext == '.slasm') {
            const code = fs.readFileSync(pathtofile, { encoding: 'utf-8' });
            slasm.eval_slasm(code);
        } else if (ext == '.slasmjson') {
            const [instr, labels] = JSON.parse(fs.readFileSync(pathtofile, { encoding: 'utf-8' }));
            slasm.evaluate(instr, undefined, labels);
        } else if (ext == '.slasmbin') {
            const [instr, labels] = slasm.SLASMBin.unpack(fs.readFileSync(pathtofile));
            slasm.evaluate(instr.map(String), undefined, labels);
        } else if (ext == '.slasmz') {
            const [instr, labels] = slasm.SLASMBin.unpack(zlib.inflateSync(fs.readFileSync(pathtofile)));
            slasm.evaluate(instr.map(String), undefined, labels);
        } else {
            console.log('unknown extension:', ext);
        }
    } else {
        console.log('no such file:', pathtofile);
    }
} else if (command == 'help') {
    console.log(`slasm - SLASM interpreter

commands:
    eval <code>       run code directly
    repl              interactive mode
    debug             repl with debug logs
    parse <code>      show parsed code
    pack <file> [z]   pack .slasm into .slasmbin (or .slasmz if z)
    unpack <file>     unpack .slasmbin/.slasmz into .slasmjson
    run <file>        run .slasm / .slasmbin / .slasmz / .slasmjson

flags:
    debug             enable debug logs (for any command but it's useful only which run, eval, repl & parse)`);
} else {
    while (true) repl();
}