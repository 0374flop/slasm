export type ErrorPhase = 'parse' | 'runtime';

export class SlasmError extends Error {
    readonly phase: ErrorPhase;
    readonly ip: number;
    readonly op?: string;

    constructor(phase: ErrorPhase, message: string, ip: number, op?: string) {
        super(message);
        this.name = 'SlasmError';
        this.phase = phase;
        this.ip = ip;
        this.op = op;
    }

    format(): string {
        const where = this.op !== undefined
            ? `ip=${this.ip} (${this.op})`
            : `ip=${this.ip}`;
        return `slasm Error [${this.phase}] ${where}: ${this.message}`;
    }
}
