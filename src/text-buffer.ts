export interface ProgressiveResult {
  text: string
  deadEvents: number
  charsSinceCheckpoint: number
  potentialIndex: number
}

export class TextBuffer {
  private latestFullText = ""
  private previousText = ""
  private deadEvents = 0
  private earsayCheckpointPos = 0

  onEvent(fullText: string): void {
    if (fullText === this.previousText) {
      this.deadEvents++
    } else {
      this.deadEvents = 0
      this.latestFullText = fullText
      this.previousText = fullText
    }
  }

  getProgressive(): ProgressiveResult {
    return {
      text: this.latestFullText,
      deadEvents: this.deadEvents,
      charsSinceCheckpoint: this.latestFullText.length,
      potentialIndex: this.earsayCheckpointPos + this.latestFullText.length,
    }
  }

  cutCheckpoint(relativePos: number): { consumed: string; remaining: string; absolutePos: number } {
    const clampedPos = Math.max(0, Math.min(relativePos, this.latestFullText.length))
    const consumed = this.latestFullText.slice(0, clampedPos)
    const remaining = this.latestFullText.slice(clampedPos)
    const absolutePos = this.earsayCheckpointPos + clampedPos
    this.earsayCheckpointPos = absolutePos
    this.latestFullText = remaining
    this.previousText = remaining
    this.deadEvents = 0
    return { consumed, remaining, absolutePos }
  }

  clearCheckpoint(): { absolutePos: number } {
    const pos = this.earsayCheckpointPos
    this.earsayCheckpointPos = 0
    return { absolutePos: 0 }
  }

  allText(): string {
    return this.latestFullText
  }

  hasUnread(): boolean {
    return this.latestFullText.length > 0
  }

  reset(): void {
    this.latestFullText = ""
    this.previousText = ""
    this.deadEvents = 0
    this.earsayCheckpointPos = 0
  }
}
