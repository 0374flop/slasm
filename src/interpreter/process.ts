import EventEmitter from 'node:events';

export type ProcessEvents = {
    output: (value: string) => void;
    input: (reply: (v: string) => void) => void;
    error: (err: Error) => void;
    done: (clog: string[]) => void;
};

export class SlasmProcess extends EventEmitter {
    result!: Promise<string[]>;
    kill!: () => void;
    stack!: string[];

    emit<K extends keyof ProcessEvents>(event: K, ...args: Parameters<ProcessEvents[K]>): boolean;
    emit(event: string, ...args: any[]): boolean {
        return super.emit(event, ...args);
    }

    on<K extends keyof ProcessEvents>(event: K, listener: ProcessEvents[K]): this;
    on(event: string, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    once<K extends keyof ProcessEvents>(event: K, listener: ProcessEvents[K]): this;
    once(event: string, listener: (...args: any[]) => void): this {
        return super.once(event, listener);
    }
}
