import EventEmitter from 'node:events';
import type { Runtime } from './vm.js';
import type { label } from './types.js';
import runInstruction from './runinstruction/index.js';

export type ProcessEvents = {
    output: (value: string) => void;
    input: (reply: (v: string) => void) => void;
    error: (err: Error) => void;
    done: (clog: string[]) => void;
    injectdone: () => void;
};

export type ProcessStatus = 'idle' | 'paused' | 'running' | 'done';

type InjectState = {
    start: number;
    end: number;
    savedWindow: string[];
    savedIp: number;
};

export class SlasmProcess extends EventEmitter {
    result: Promise<string[]>;

    private runtime!: Runtime;
    private _status: ProcessStatus = 'idle';
    private inject_: InjectState | null = null;
    private resolveResult!: (clog: string[]) => void;

    constructor() {
        super();
        this.result = new Promise<string[]>((resolve) => {
            this.resolveResult = resolve;
        });
    }

    attach(runtime: Runtime): void {
        this.runtime = runtime;
    }

    get status(): ProcessStatus {
        return this._status;
    }

    get ip(): number {
        return this.runtime.ip + 1;
    }

    get stack(): string[] {
        return this.runtime.stack;
    }

    get memory(): Map<number, string> {
        return this.runtime.memory;
    }

    get instructions(): string[] {
        return this.runtime.instructions;
    }

    get labels(): label[] {
        return this.runtime.labels;
    }

    get clog(): string[] {
        return this.runtime.clog;
    }

    get injecting(): boolean {
        return this.inject_ !== null;
    }

    get finished(): boolean {
        return this._status === 'done';
    }

    private get atEnd(): boolean {
        return this.runtime.ip >= this.runtime.instructions.length;
    }

    private finish(): void {
        if (this._status === 'done') return;
        this._status = 'done';
        this.emit('done', this.runtime.clog);
        this.resolveResult(this.runtime.clog);
    }

    private fail(err: unknown): void {
        const e = err instanceof Error ? err : new Error(String(err));
        if (this._status === 'done') return;
        this._status = 'done';
        this.emit('error', e);
        this.resolveResult(this.runtime.clog);
    }

    private async execute(): Promise<void> {
        const rt = this.runtime;
        const inj = this.inject_;

        if (inj !== null) {
            if (rt.ip >= inj.end) {
                this.finishInject();
                return;
            }
            try {
                await runInstruction(rt);
            } catch (err) {
                this.emit('error', err instanceof Error ? err : new Error(String(err)));
                this.finishInject();
                return;
            }
            if (this.inject_ !== null && rt.ip >= this.inject_.end) this.finishInject();
            return;
        }

        if (this.atEnd) {
            this.finish();
            return;
        }

        try {
            await runInstruction(rt);
        } catch (err) {
            this.fail(err);
            return;
        }

        if (this.atEnd && this._status !== 'done') this.finish();
    }

    async start(): Promise<void> {
        if (this._status === 'done' || this._status === 'running') return;
        this._status = 'running';
        await Promise.resolve();
        await this.runLoop();
    }

    async continue(): Promise<void> {
        return this.start();
    }

    private async runLoop(): Promise<void> {
        while (this._status === 'running') {
            const wasInjecting = this.inject_ !== null;
            await this.execute();
            if (this._status !== 'running') return;
            if (wasInjecting && this.inject_ === null) {
                this._status = 'paused';
                return;
            }
        }
    }

    async step(): Promise<void> {
        if (this._status === 'done') return;
        if (this._status === 'running') throw new Error('step: process is running');
        this._status = 'running';
        await this.execute();
        if (this._status === 'running') this._status = 'paused';
    }

    inject(instructions: string[], labels: label[] = []): void {
        if (this._status === 'done') throw new Error('inject: process is finished');
        if (this._status === 'running') throw new Error('inject: process is running');
        if (this.inject_ !== null) throw new Error('inject: already injecting');

        const rt = this.runtime;
        const start = rt.ip;
        const end = start + instructions.length;

        const savedWindow = rt.instructions.slice(start, end);
        rt.instructions.splice(start, instructions.length, ...instructions);

        for (const l of labels) {
            const shifted = { name: l.name, ip: l.ip + start };
            const existing = rt.labels.findIndex(x => x.name === shifted.name);
            if (existing !== -1) rt.labels.splice(existing, 1);
            rt.labels.push(shifted);
        }

        this.inject_ = { start, end, savedWindow, savedIp: start };
    }

    abortInject(): void {
        if (this.inject_ === null) return;
        this.finishInject();
    }

    private finishInject(): void {
        const inj = this.inject_;
        if (inj === null) return;
        const rt = this.runtime;

        rt.instructions.splice(inj.start, inj.end - inj.start, ...inj.savedWindow);
        rt.ip = inj.savedIp;
        this.inject_ = null;

        if (this._status === 'running') this._status = 'paused';
        this.emit('injectdone');
    }

    kill(): void {
        if (this._status === 'done') return;
        if (this.inject_ !== null) this.finishInject();
        this.runtime.ip = this.runtime.instructions.length;
        this.finish();
    }

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
