import EventEmitter from 'node:events';

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'fatal' | 'clog';

export interface LogEntry {
    level: LogLevel;
    message: string;
    error?: unknown;
    timestamp: Date;
}

export class Logger extends EventEmitter {
    private static readonly COLORS: Record<LogLevel, string> = {
        log:   '\x1b[37m',
        clog:  '\x1b[36m',
        info:  '\x1b[36m',
        warn:  '\x1b[33m',
        error: '\x1b[31m',
        fatal: '\x1b[31;1m',
    };

    private static readonly RESET = '\x1b[0m';

    public enabled: boolean;

    constructor(enabled: boolean = false) {
        super();
        this.enabled = enabled;
    }

    private write(level: LogLevel, message: string, error?: unknown): void {
        const entry: LogEntry = { level, message, error, timestamp: new Date() };
        const color = Logger.COLORS[level];
        const reset = Logger.RESET;

        if (level === 'log' && !this.enabled) return;

        const stream = level === 'error' || level === 'fatal'
            ? process.stderr
            : process.stdout;

        stream.write(`${color}${level}${reset}  ${message}\n`);
        if (error) stream.write(`${error}\n`);

        this.emit('log', entry);
    }

    public log(...messages: unknown[]): void {
        this.write('log', messages.join(' '));
    }
    public clog(...messages: unknown[]): void {
        this.write('clog', messages.join(' '));
    }

    public info(message: string): void {
        this.write('info', message);
    }

    public warn(message: string): void {
        this.write('warn', message);
    }

    public error(message: string, error?: unknown): void {
        this.write('error', message, error);
    }

    public fatal(message: string, error?: unknown): never {
        this.write('fatal', message, error);
        throw error instanceof Error ? error : new Error(message);
    }
}

const logger = new Logger();
export default logger;