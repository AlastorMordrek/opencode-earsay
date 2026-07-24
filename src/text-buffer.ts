export interface ProgressiveResult {
  text: string
  deadEvents: number
  textEvents: number
  charsSinceCheckpoint: number
  potentialIndex: number
}

export class TextBuffer {
  private accumulated = ""
  private deadEvents = 0
  private textEvents = 0
  private earsayCheckpointPos = 0

  onEvent(delta: string): void {
    if (delta.length > 0) {
      this.accumulated += delta
      this.textEvents++
      this.deadEvents = 0
    } else {
      this.deadEvents++
      this.textEvents = 0
    }
  }

  getProgressive(): ProgressiveResult {
    return {
      text: this.accumulated,
      deadEvents: this.deadEvents,
      textEvents: this.textEvents,
      charsSinceCheckpoint: this.accumulated.length,
      potentialIndex: this.earsayCheckpointPos + this.accumulated.length,
    }
  }

  cutCheckpoint(relativePos: number): { consumed: string; remaining: string; absolutePos: number } {
    const clampedPos = Math.max(0, Math.min(relativePos, this.accumulated.length))
    const consumed = this.accumulated.slice(0, clampedPos)
    const remaining = this.accumulated.slice(clampedPos)
    const absolutePos = this.earsayCheckpointPos + clampedPos
    this.earsayCheckpointPos = absolutePos
    this.accumulated = remaining
    this.deadEvents = 0
    this.textEvents = 0
    return { consumed, remaining, absolutePos }
  }

  clearCheckpoint(): { absolutePos: number } {
    this.earsayCheckpointPos = 0
    return { absolutePos: 0 }
  }

  allText(): string {
    return this.accumulated
  }

  hasUnread(): boolean {
    return this.accumulated.length > 0
  }

  reset(): void {
    this.accumulated = ""
    this.deadEvents = 0
    this.textEvents = 0
    this.earsayCheckpointPos = 0
  }
}
