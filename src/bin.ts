#!/usr/bin/env node
const [command, ...args] = process.argv.slice(2);
import slasm from "./interpreter";
import path from "node:path";
import fs from "node:fs";
import logger from "./simpledegugger";

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
} else if (command) {
    const pathtofile = path.normalize(command);
    if (fs.existsSync(pathtofile)) {
        const code = fs.readFileSync(pathtofile, { encoding: 'utf-8' });
        slasm.eval_slasm(code);
    } else {
        console.log('no such file:', pathtofile);
    }
} else {
    while (true) repl();
}