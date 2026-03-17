#!/usr/bin/env node
const [command, ...args] = process.argv.slice(2);
import slasm from "./interpreter";
import logger from "./simpledegugger";
import path from "node:path";
import fs from "node:fs";
import zlib from "node:zlib";

function repl() {
    const code = slasm.ri.readlineSync('> ');
    if (code === null || code.toLowerCase() === 'exit') {
        console.log('--exit--');
        process.exit();
    }
    try {
        slasm.eval_slasm(code);
    } catch (error) {
        if (error instanceof Error) {
            console.log(error.message);
        } else {
            console.log(error);
        }
    }
}

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
        const labels = parsedata[1].map((line, i) => `${i + 1}. ${line.name}^${line.ip}`).join('\n')
        const comments = parsedata[2].map((line, i) => `${i + 1}. ${line}`).join("\n");
        console.log(instr ? instr : '(none)');
        console.log(parsedata[0].length, '^', '------------');
        console.log(labels ? labels : '(none)');
        console.log(parsedata[1].length, '^', '------------');
        console.log(comments ? comments : '(none)');
        console.log(parsedata[2].length, '^', '------------');
    }
} else if (command == 'pack') {
    const pathtofile = path.normalize(args[0]);
    const useZ = args.includes('z');
    if (fs.existsSync(pathtofile)) {
        const code = fs.readFileSync(pathtofile, { encoding: 'utf-8' });
        const parsedata = slasm.parse(slasm.tokenize(code));
        let buff = slasm.SLASMBin.pack(parsedata);
        const ext = useZ ? '.slasmz' : '.slasmbin';
        if (useZ) buff = zlib.deflateSync(buff);
        const filename = path.basename(pathtofile, ".slasm") + ext;
        const pathtobuff = path.join(path.dirname(pathtofile), filename);
        fs.writeFileSync(pathtobuff, buff);
        console.log(pathtobuff);
    } else {
        console.log('no such file:', pathtofile);
    }
} else if (command == 'unpack') {
    const pathtofile = path.normalize(args[0]);
    if (fs.existsSync(pathtofile)) {
        const ext = path.extname(pathtofile);
        let buff = fs.readFileSync(pathtofile);
        if (ext == '.slasmz') buff = zlib.inflateSync(buff);
        const parsedata = slasm.SLASMBin.unpack(buff);
        const filename = path.basename(pathtofile, ext) + '.slasmjson';
        const pathtobuff = path.join(path.dirname(pathtofile), filename);
        fs.writeFileSync(pathtobuff, JSON.stringify(parsedata, null, 2));
        console.log(pathtobuff);
    } else {
        console.log('no such file:', pathtofile);
    }
} else if (command == 'run') {
    const pathtofile = path.normalize(args[0]);
    if (fs.existsSync(pathtofile)) {
        const ext = path.extname(pathtofile);
        if (ext == '.slasm') {
            const code = fs.readFileSync(pathtofile, { encoding: 'utf-8' });
            slasm.eval_slasm(code);
            } else if (ext == '.slasmjson') {
                const json = fs.readFileSync(pathtofile, { encoding: 'utf-8' });
                const [instr, labels] = JSON.parse(json);
                slasm.evaluate(instr, undefined, labels);
            } else if (ext == '.slasmbin') {
                const buff = fs.readFileSync(pathtofile);
                const [instr1, labels] = slasm.SLASMBin.unpack(buff);
                const instr: string[] = instr1.map((line => String(line)));
                slasm.evaluate(instr, undefined, labels);
            } else if (ext == '.slasmz') {
                const buff = zlib.inflateSync(fs.readFileSync(pathtofile));
                const [instr1, labels] = slasm.SLASMBin.unpack(buff);
                const instr: string[] = instr1.map((line => String(line)));
                slasm.evaluate(instr, undefined, labels);
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
    debug             enable debug logs (for any command)`);
} else {
    while (true) repl();
}