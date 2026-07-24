import type { EarsayManager } from "./earsay-manager"
import type { TextBuffer } from "./text-buffer"

const TRIGGER_TEXT_EVENTS = 3
const TRIGGER_SILENCE_EVENTS = 3
const TICK_INTERVAL_MS = 1000

export class ContextInjector {
  private timer: ReturnType<typeof setInterval> | null = null
  private sessionID: string | null = null
  private lastInjected = ""
  private hasInjected = false

  constructor(
    private buffer: TextBuffer,
    private earsay: EarsayManager,
    private client: any,
  ) {}

  setSessionID(id: string | null): void {
    this.sessionID = id
  }

  start(): void {
    this.timer = setInterval(() => this.tick(), TICK_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async tick(): Promise<void> {
    const prog = this.buffer.getProgressive()
    const { text, deadEvents, textEvents } = prog
    if (!this.sessionID) return

    // Inject new delta as noReply
    if (textEvents > 0 && text.length > this.lastInjected.length) {
      const delta = text.slice(this.lastInjected.length)
      if (delta.length > 0) {
        await this.injectNoReply(delta)
        this.lastInjected = text
        this.hasInjected = true
      }
    }

    // Trigger on 3 text events or 3 silence events after injected text
    const shouldTrigger =
      (textEvents >= TRIGGER_TEXT_EVENTS && this.hasInjected) ||
      (deadEvents >= TRIGGER_SILENCE_EVENTS && this.hasInjected)

    if (shouldTrigger) {
      await this.triggerLLM()
      if (this.sessionID) {
        const result = this.buffer.cutCheckpoint(text.length)
        await this.earsay.setCheckpoint(result.absolutePos)
      }
      this.lastInjected = ""
      this.hasInjected = false
    }
  }

  private async injectNoReply(delta: string): Promise<void> {
    try {
      await this.client.session.prompt({
        path: { id: this.sessionID! },
        body: {
          noReply: true,
          parts: [{ type: "text", text: `[Voice]: ${delta}` }],
        },
      })
    } catch {
      // session not ready, will retry next tick
    }
  }

  private async triggerLLM(): Promise<void> {
    try {
      await this.client.session.prompt({
        path: { id: this.sessionID! },
        body: {
          parts: [{ type: "text", text: "" }],
        },
      })
    } catch {
      // session not ready, will retry next tick
    }
  }
}
