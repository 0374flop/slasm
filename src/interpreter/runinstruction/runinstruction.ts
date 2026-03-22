import logger from "../../output.js";
import throw_ from "../../throw_.js";
import type { label } from "../parse.js";

export type State = {
    instructions: string[];
    stack: string[];
    ip: number;
    clog: string[];
    memory: Map<number, string>;
    labels: label[];
    callstack: number[]; // стек адресов возврата для call/ret
};

// Синхронный ввод (блокирующий, для (q))
function readlineSync(prompt: string = ''): string {
    const buf = Buffer.alloc(1024);
    if (prompt) process.stdout.write(prompt);
    const n = require('fs').readSync(0, buf, 0, buf.length, null);
    return buf.slice(0, n).toString().replace(/\r?\n$/, '');
}

// Get Label Name: label
function gln(state: State, name: string) {
    return state.labels.find(label => label.name === name);
}

function run_instruction(state: State): State {
    const operator = state.instructions[state.ip];
    logger.log('RI start:', operator, state.ip);

    switch (operator) {
        case 'push': {
            state.ip++;
            if (state.ip >= state.instructions.length) throw_('Runtime', 'Missing value after push');
            logger.log('push', state.ip, state.instructions[state.ip]);
            state.stack.push(state.instructions[state.ip]);
            state.ip++;
            break;
        }
        case 'clog': {
            const val = state.stack.pop() ?? '';
            logger.clog(val, state.clog);
            state.ip++;
            break;
        }
        case 'cnum': {
            state.stack.push(String(state.clog.length - 1));
            state.ip++;
            break;
        }
        case 'cchan': {
            // cchan: pop(n), pop(value)
            const n = Number(state.stack.pop());
            const val = state.stack.pop() ?? '';
            if (n < 0 || n >= state.clog.length) throw_('Runtime', `cchan: index ${n} out of range`);
            state.clog[n] = val;
            state.ip++;
            break;
        }
        case 'cget': {
            const n = Number(state.stack.pop());
            if (n < 0 || n >= state.clog.length) throw_('Runtime', `cget: index ${n} out of range`);
            state.stack.push(state.clog[n]);
            state.ip++;
            break;
        }
        case 'q': {
            const input = readlineSync('> ');
            state.stack.push(input);
            state.ip++;
            break;
        }
        case 'W': {
            // W: pop(n), pop(value)
            const val = state.stack.pop() ?? '';
            const n = Number(state.stack.pop());
            state.memory.set(n, val);
            state.ip++;
            break;
        }
        case 'R': {
            const n = Number(state.stack.pop());
            state.stack.push(state.memory.get(n) ?? '0');
            state.ip++;
            break;
        }
        case '~': {
            // Соединить всё что в стеке БЕЗ пробела
            const b = state.stack.pop() ?? '';
            const a = state.stack.pop() ?? '';
            state.stack.push(a + b);
            state.ip++;
            break;
        }
        case 'JOIN': {
            // Взять ВЕСЬ стек и соединить С пробелами
            const joined = state.stack.join(' ');
            state.stack.push(joined);
            state.ip++;
            break;
        }
        case 'rep': {
            // pop(text), pop(n)
            const text = state.stack.pop() ?? '';
            const n = Number(state.stack.pop());
            state.stack.push(text.repeat(n));
            state.ip++;
            break;
        }
        case 'char': {
            // pop(n), pop(str) → символ str[n]
            const n = Number(state.stack.pop());
            const str = state.stack.pop() ?? '';
            state.stack.push(str[n] ?? '');
            state.ip++;
            break;
        }
        case 'L': {
            // ето буква из готового массива а не 
            const upper = Number(state.stack.pop());
            const id = Number(state.stack.pop());
            const SRC = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const src = ' abcdefghijklmnopqrstuvwxyz';
            const L = upper == 1 ? SRC[id] : src[id];
            state.stack.push(L);
            state.ip++;
            break;
        }
        case 'gln': {
            // Get Label Name
            const name = state.stack.pop();
            if (name) {
                const label = gln(state, name);
                logger.log(state.labels);
                state.stack.push(String(label?.ip));
            } else {
                throw_('Runtime', 'GLN name empty');
            }
            state.ip++;
            break;
        }
        case '+': {
            const b = Number(state.stack.pop());
            const a = Number(state.stack.pop());
            state.stack.push(String(a + b));
            state.ip++;
            break;
        }
        case '-': {
            const b = Number(state.stack.pop());
            const a = Number(state.stack.pop());
            state.stack.push(String(a - b));
            state.ip++;
            break;
        }
        case '*': {
            const b = Number(state.stack.pop());
            const a = Number(state.stack.pop());
            state.stack.push(String(a * b));
            state.ip++;
            break;
        }
        case '/': {
            const b = Number(state.stack.pop());
            const a = Number(state.stack.pop());
            if (b === 0) throw_('Runtime', 'Division by zero');
            state.stack.push(String(a / b));
            state.ip++;
            break;
        }
        case '=': {
            const b = state.stack.pop();
            const a = state.stack.pop();
            state.stack.push(String(a === b));
            state.ip++;
            break;
        }
        case '<': {
            const b = Number(state.stack.pop());
            const a = Number(state.stack.pop());
            state.stack.push(String(a < b));
            state.ip++;
            break;
        }
        case '>': {
            const b = Number(state.stack.pop());
            const a = Number(state.stack.pop());
            state.stack.push(String(a > b));
            state.ip++;
            break;
        }
        case '!': {
            const val = state.stack.pop();
            state.stack.push(String(val !== 'true'));
            state.ip++;
            break;
        }
        case 'jump': {
            const target = Number(state.stack.pop());
            if (target < 1 || target > state.instructions.length) throw_('Runtime', `jump: target ${target} out of range`);
            state.ip = target - 1;
            break;
        }
        case '?': {
            const target = Number(state.stack.pop());
            const cond = state.stack.pop();
            if (cond === 'true') {
                if (target < 1 || target > state.instructions.length) throw_('Runtime', `?: target ${target} out of range`);
                state.ip = target - 1;
            } else {
                state.ip++;
            }
            break;
        }
        case 'call': {
            // pop(addr) — прыгает на addr, пушит адрес возврата в callstack
            const target = Number(state.stack.pop());
            if (target < 1 || target > state.instructions.length) throw_('Runtime', `call: target ${target} out of range`);
            state.callstack.push(state.ip + 1); // адрес следующей инструкции после call
            state.ip = target - 1;
            break;
        }
        case 'ret': {
            // возврат из функции
            if (state.callstack.length === 0) throw_('Runtime', 'ret: callstack is empty');
            state.ip = state.callstack.pop()!;
            break;
        }
        case 'csnum': {
            // размер callstack — полезно для отладки
            state.stack.push(String(state.callstack.length));
            state.ip++;
            break;
        }

        case 'S': {
            const n = Number(state.stack.pop());
            state.stack.push(' .,();-'[n] ?? '');
            state.ip++;
            break;
        }
        case 'getstack': {
            const n = Number(state.stack.pop());
            if (n < 0 || n >= state.stack.length) throw_('Runtime', `getstack: index ${n} out of range`);
            state.stack.push(state.stack[n]);
            state.ip++;
            break;
        }
        case 'cstack': {
            // pop(n), pop(data)
            const n = Number(state.stack.pop());
            const data = state.stack.pop() ?? '';
            if (n < 0 || n >= state.stack.length) throw_('Runtime', `cstack: index ${n} out of range`);
            state.stack[n] = data;
            state.ip++;
            break;
        }
        case '_': {
            state.stack.push('');
            state.ip++;
            break;
        }
        case 'clearstack': {
            state.stack = [];
            state.ip++;
            break;
        }

        case 'i': {
            // Номер текущей инструкции (1-based)
            state.stack.push(String(state.ip + 1));
            state.ip++;
            break;
        }
        case 'inum': {
            state.stack.push(String(state.instructions.length));
            state.ip++;
            break;
        }
        case 'iget': {
            const n = Number(state.stack.pop());
            if (n < 1 || n > state.instructions.length) throw_('Runtime', `iget: index ${n} out of range`);
            state.stack.push(state.instructions[n - 1]);
            state.ip++;
            break;
        }
        case 'SO': {
            // pop(cell), pop(operator)
            const cell = Number(state.stack.pop());
            const newOp = state.stack.pop() ?? '';
            if (cell < 1 || cell > state.instructions.length) throw_('Runtime', `SO: cell ${cell} out of range`);
            state.instructions[cell - 1] = newOp;
            state.ip++;
            break;
        }

        case '?*': {
            const max = Number(state.stack.pop());
            const min = Number(state.stack.pop());
            const rand = Math.floor(Math.random() * (max - min + 1)) + min;
            state.stack.push(String(rand));
            state.ip++;
            break;
        }
        case 'begin': {
            state.ip++;
            break;
        }
        case 'none': {
            state.ip++;
            break;
        }
        case 'wait': {
            const ms = Number(state.stack.pop());
            const end = Date.now() + ms;
            while (Date.now() < end) {}
            state.ip++;
            break;
        }
        case 'throw': {
            const msg = state.stack.pop() ?? 'unknown';
            throw_('', msg);
        }

        default: {
            throw_('Runtime', `Undefined operator '${operator}'`);
            state.ip++;
        }
    }

    logger.log('RI end:', state.ip);
    return state;
}

export default { readlineSync, run_instruction }