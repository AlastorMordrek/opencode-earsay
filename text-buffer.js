export class TextBuffer {
    accumulated = "";
    deadEvents = 0;
    textEvents = 0;
    earsayCheckpointPos = 0;
    onEvent(delta) {
        if (delta.length > 0) {
            this.accumulated += delta;
            this.textEvents++;
            this.deadEvents = 0;
        }
        else {
            this.deadEvents++;
            this.textEvents = 0;
        }
    }
    getProgressive() {
        return {
            text: this.accumulated,
            deadEvents: this.deadEvents,
            textEvents: this.textEvents,
            charsSinceCheckpoint: this.accumulated.length,
            potentialIndex: this.earsayCheckpointPos + this.accumulated.length,
        };
    }
    cutCheckpoint(relativePos) {
        const clampedPos = Math.max(0, Math.min(relativePos, this.accumulated.length));
        const consumed = this.accumulated.slice(0, clampedPos);
        const remaining = this.accumulated.slice(clampedPos);
        const absolutePos = this.earsayCheckpointPos + clampedPos;
        this.earsayCheckpointPos = absolutePos;
        this.accumulated = remaining;
        this.deadEvents = 0;
        this.textEvents = 0;
        return { consumed, remaining, absolutePos };
    }
    clearCheckpoint() {
        this.earsayCheckpointPos = 0;
        return { absolutePos: 0 };
    }
    allText() {
        return this.accumulated;
    }
    hasUnread() {
        return this.accumulated.length > 0;
    }
    resetCounters() {
        this.deadEvents = 0;
        this.textEvents = 0;
    }
    reset() {
        this.accumulated = "";
        this.deadEvents = 0;
        this.textEvents = 0;
        this.earsayCheckpointPos = 0;
    }
}
//# sourceMappingURL=text-buffer.js.map