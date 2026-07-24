export interface ProgressiveResult {
  text: string
  silent: boolean
  charsSinceCheckpoint: number
  potentialIndex: number
}

export interface NewTextResult {
  text: string
  potential_index: number
}

export class TextBuffer {
  private buffer = ""
  private lastCheckpoint = 0
  private lastActivity = Date.now()
  private silenceTimeoutMs: number

  constructor(silenceTimeoutMs = 2000) {
    this.silenceTimeoutMs = silenceTimeoutMs
  }

  append(chunk: string): void {
    this.buffer += chunk
    this.lastActivity = Date.now()
  }

  getNewText(): NewTextResult {
    const text = this.buffer.slice(this.lastCheckpoint)
    return {
      text,
      potential_index: this.getPotentialIndex(),
    }
  }

  getProgressive(): ProgressiveResult {
    const text = this.buffer.slice(this.lastCheckpoint)
    const elapsed = Date.now() - this.lastActivity
    return {
      text,
      silent: elapsed >= this.silenceTimeoutMs,
      charsSinceCheckpoint: text.length,
      potentialIndex: this.getPotentialIndex(),
    }
  }

  setCheckpoint(): { index: number; text: string } {
    const text = this.buffer.slice(this.lastCheckpoint)
    this.lastCheckpoint = this.buffer.length
    return { index: this.getPotentialIndex(), text }
  }

  allText(): string {
    return this.buffer
  }

  hasUnread(): boolean {
    return this.buffer.length > this.lastCheckpoint
  }

  reset(): void {
    this.buffer = ""
    this.lastCheckpoint = 0
    this.lastActivity = Date.now()
  }

  private getPotentialIndex(): number {
    return this.buffer.length
  }
}
