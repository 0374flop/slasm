import EventEmitter from 'node:events';

export class SlasmProcess extends EventEmitter {
    result!: Promise<string[]>;
    kill!:   () => void;

    emit(event: 'output',      value: string):             boolean;
    emit(event: 'input',       reply: (v: string) => void): boolean;
    emit(event: 'error',       err: Error):                boolean;
    emit(event: 'done',        clog: string[]):             boolean;
    emit(event: 'module:load', namespace: string, filepath: string): boolean;
    emit(event: string, ...args: any[]): boolean {
        return super.emit(event, ...args);
    }

    on(event: 'output',      listener: (value: string) => void):              this;
    on(event: 'input',       listener: (reply: (v: string) => void) => void): this;
    on(event: 'error',       listener: (err: Error) => void):                 this;
    on(event: 'done',        listener: (clog: string[]) => void):             this;
    on(event: 'module:load', listener: (namespace: string, filepath: string) => void): this;
    on(event: string, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    once(event: 'output',      listener: (value: string) => void):              this;
    once(event: 'input',       listener: (reply: (v: string) => void) => void): this;
    once(event: 'error',       listener: (err: Error) => void):                 this;
    once(event: 'done',        listener: (clog: string[]) => void):             this;
    once(event: 'module:load', listener: (namespace: string, filepath: string) => void): this;
    once(event: string, listener: (...args: any[]) => void): this {
        return super.once(event, listener);
    }
}
