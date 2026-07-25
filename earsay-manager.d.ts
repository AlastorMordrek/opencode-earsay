export interface EarsayStatus {
    status: "listening" | "paused" | "stopped";
    uptime_seconds: number;
    chars_transcribed: number;
    checkpoint_count: number;
    subscription_count: number;
    port: number;
}
export interface EarsayManagerOptions {
    port: number;
    model?: string;
}
export declare class EarsayManager {
    private proc;
    private port;
    private model;
    private running;
    constructor(opts: EarsayManagerOptions);
    get baseUrl(): string;
    get isRunning(): boolean;
    start(): Promise<boolean>;
    stop(): Promise<void>;
    pause(): Promise<boolean>;
    resume(): Promise<boolean>;
    status(): Promise<EarsayStatus | null>;
    setCheckpoint(absolutePos: number): Promise<boolean>;
    ensureRunning(): Promise<boolean>;
    destroy(): void;
    private ping;
    private api;
}
//# sourceMappingURL=earsay-manager.d.ts.map