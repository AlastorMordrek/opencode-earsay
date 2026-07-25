import type { EarsayManager } from "./earsay-manager"
import type { TextBuffer } from "./text-buffer"
import { writeLog } from "./util"

const TRIGGER_TEXT_EVENTS = 3
const TRIGGER_SILENCE_EVENTS = 3
const TICK_INTERVAL_MS = 1000
const SESSION_RETRY_TICKS = 5

export class ContextInjector {
  private timer: ReturnType<typeof setInterval> | null = null
  private sessionID: string | null = null
  private lastInjected = ""
  private hasInjected = false
  private ticksSinceSessionRetry = 0

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

    if (!this.sessionID) {
      this.ticksSinceSessionRetry++
      if (this.ticksSinceSessionRetry >= SESSION_RETRY_TICKS) {
        this.ticksSinceSessionRetry = 0
        await this.retrySessionID()
      }
      if (!this.sessionID) return
    }

    // Inject new delta as noReply
    if (textEvents > 0 && text.length > this.lastInjected.length) {
      const delta = text.slice(this.lastInjected.length)
      if (delta.length > 0) {
        writeLog(`injecting ${delta.length} chars`)
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
      writeLog("triggering LLM turn")
      await this.triggerLLM()
      if (this.sessionID) {
        const result = this.buffer.cutCheckpoint(text.length)
        await this.earsay.setCheckpoint(result.absolutePos)
      }
      this.lastInjected = ""
      this.hasInjected = false
    }
  }

  private async retrySessionID(): Promise<void> {
    try {
      const sessions = await this.client.session.list()
      const list = Array.isArray(sessions) ? sessions : sessions?.data ?? []
      if (list.length > 0) {
        const latest = list[list.length - 1]
        if (latest?.id) {
          this.sessionID = latest.id
          writeLog(`session ID retry: ${latest.id}`)
        }
      }
    } catch {
      // session server not ready yet
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
    } catch (err) {
      writeLog(`injectNoReply failed: ${err}`)
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
    } catch (err) {
      writeLog(`triggerLLM failed: ${err}`)
    }
  }
}
