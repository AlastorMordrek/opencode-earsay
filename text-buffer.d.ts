export interface ProgressiveResult {
    text: string;
    deadEvents: number;
    textEvents: number;
    charsSinceCheckpoint: number;
    potentialIndex: number;
}
export declare class TextBuffer {
    private accumulated;
    private deadEvents;
    private textEvents;
    private earsayCheckpointPos;
    onEvent(delta: string): void;
    getProgressive(): ProgressiveResult;
    cutCheckpoint(relativePos: number): {
        consumed: string;
        remaining: string;
        absolutePos: number;
    };
    clearCheckpoint(): {
        absolutePos: number;
    };
    allText(): string;
    hasUnread(): boolean;
    resetCounters(): void;
    reset(): void;
}
//# sourceMappingURL=text-buffer.d.ts.map