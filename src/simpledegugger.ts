import EventEmitter from "node:events";
class Debugger extends EventEmitter {
    constructor(public enabled: boolean) { super(); }
    public log(...args: any[]) {
        if (this.enabled) console.log(...args);
        this.emit('log', args);
    }
    public warn(...args: any[]) {
        if (this.enabled) console.warn(...args);
        this.emit('warn', args);
    }
    public error(...args: any[]) {
        if (this.enabled) console.error(...args);
        this.emit('error', args);
    }

    public clog(text: any, array: string[] = []) {
        array.push(text);
        console.log('CLOG: "'+text+'"');
        this.emit('clog', text, array);
    }
}
const logger = new Debugger(false);
export default logger;