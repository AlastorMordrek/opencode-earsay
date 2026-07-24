import { tool } from "@opencode-ai/plugin"
import type { EarsayManager } from "./earsay-manager"
import type { TextBuffer } from "./text-buffer"
import type { SSEClient } from "./sse-client"

export interface ToolDeps {
  earsay: EarsayManager
  buffer: TextBuffer
  sse: SSEClient
}

export function createTools(deps: ToolDeps): Record<string, ReturnType<typeof tool>> {
  const { earsay, buffer, sse } = deps

  async function ensureEarsay(): Promise<void> {
    if (earsay.isRunning) return
    const ok = await earsay.start()
    if (!ok) throw new Error("earsay not available. Install: pip install earsay")
  }

  return {

    voice_start: tool({
      description: [
        "Start the earsay speech-to-text server. Normally auto-started on plugin load.",
        "Use this only if the server crashed or was manually stopped.",
        "Idempotent — does nothing if already running.",
      ].join(" "),
      args: {},
      async execute() {
        const ok = await earsay.start()
        if (!ok) {
          return JSON.stringify({ status: "failed", message: "earsay binary not found or failed to start" })
        }
        return JSON.stringify({ status: "started" })
      },
    }),

    voice_stop: tool({
      description: "Stop the earsay server entirely. Kills the process, releases the microphone. Speech input will stop.",
      args: {},
      async execute() {
        await earsay.stop()
        return JSON.stringify({ status: "stopped" })
      },
    }),

    voice_pause: tool({
      description: [
        "Pause the microphone. The server stays alive but no audio is captured and",
        "no events fire (including timeout events). The buffer freezes in its current state.",
        "IMPORTANT: Only call this when the USER explicitly asks to stop listening",
        "via typed or previously-spoken command. After pausing, the user must TYPE",
        "a resume command — do NOT resume autonomously.",
      ].join(" "),
      args: {},
      async execute() {
        await ensureEarsay()
        const ok = await earsay.pause()
        if (!ok) throw new Error("failed to pause earsay")
        return JSON.stringify({ status: "paused" })
      },
    }),

    voice_resume: tool({
      description: [
        "Resume the microphone after a pause. Re-opens audio capture and events resume flowing.",
        "CRITICAL: Only call this when the user explicitly types a resume command.",
        "Do NOT call this autonomously — the mic was paused for a reason.",
      ].join(" "),
      args: {},
      async execute() {
        await ensureEarsay()
        const ok = await earsay.resume()
        if (!ok) throw new Error("failed to resume earsay")
        return JSON.stringify({ status: "listening" })
      },
    }),

    voice_subscribe: tool({
      description: [
        "Reconnect the SSE event stream if it disconnected. Normally the subscription",
        "is auto-started on plugin load and requires no user action.",
        "Use this only if voice_get_progressive returns stale text and",
        "you suspect the SSE connection dropped.",
      ].join(" "),
      args: {},
      async execute() {
        await ensureEarsay()
        sse.subscribe(
          earsay.baseUrl,
          (event) => buffer.onEvent(event.text || ""),
          (err) => console.warn("[earsay] SSE error:", err.message),
          { chars: 30, timeout: 3000, fullchunk: true },
        )
        return JSON.stringify({ status: "subscribed" })
      },
    }),

    voice_unsubscribe: tool({
      description: [
        "Unsubscribe from the SSE event stream. Stops buffer updates.",
        "The earsay server stays running. Use voice_subscribe to reconnect.",
      ].join(" "),
      args: {},
      async execute() {
        sse.unsubscribe()
        return JSON.stringify({ status: "unsubscribed" })
      },
    }),

    voice_get_progressive: tool({
      description: [
        "Get the current voice input state. This is the PRIMARY tool for speech input.",
        "The buffer is always being populated by the SSE stream — call this each turn.",
        "",
        "Returns:",
        "- text: full accumulated text since the last checkpoint. Empty string means",
        "  no speech yet or all text was consumed by a previous cutCheckpoint.",
        "- deadEvents: number of consecutive SSE events with no new text.",
        "  Each event fires after ~3s timeout. 3+ deadEvents ≈ 9s silence.",
        "- charsSinceCheckpoint: character length of current text.",
        "- potentialIndex: absolute char position in earsay's buffer.",
        "",
        "Analyze the text semantically each turn. When it contains a complete",
        "actionable request, call voice_cut_checkpoint to claim it.",
      ].join(" "),
      args: {},
      async execute() {
        return JSON.stringify(buffer.getProgressive())
      },
    }),

    voice_cut_checkpoint: tool({
      description: [
        "Claim the first N characters of the current text as a completed actionable item.",
        "The consumed portion (0..charPosition) is returned for you to act on.",
        "Remaining text (charPosition..end) stays in the buffer for future passes.",
        "Calls earsay's checkpoint API server-side.",
        "",
        "Example: text='create user api with get and post auth required now add logging'",
        "If the first complete request ends at char 44 ('create user api with get and post'):",
        "  cutCheckpoint(44) → consumed='create user api with get and post'",
        "                       remaining='auth required now add logging'",
        "",
        "Use when you have identified a semantically complete request in the text.",
      ].join(" "),
      args: {
        charPosition: tool.schema.number().describe("Character position to cut at. First N chars of the current progressive text become the consumed actionable item. Remaining text stays in the buffer for next pass."),
      },
      async execute(args) {
        await ensureEarsay()
        const { consumed, remaining, absolutePos } = buffer.cutCheckpoint(args.charPosition)
        await earsay.setCheckpoint(absolutePos)
        return JSON.stringify({
          consumed,
          remaining,
          absolutePos,
          consumedLength: consumed.length,
          remainingLength: remaining.length,
        })
      },
    }),

    voice_clear_checkpoint: tool({
      description: "Undo the last checkpoint cut. Resets the buffer reclaiming all text. Use if you cut at the wrong position and need to re-analyze from scratch.",
      args: {},
      async execute() {
        buffer.clearCheckpoint()
        return JSON.stringify({ status: "cleared" })
      },
    }),

    voice_consume_all: tool({
      description: [
        "Consume all current text at once. Marks the entire buffer as read.",
        "Use this when you want a clean slate — e.g., you already processed",
        "everything or the session is ending.",
      ].join(" "),
      args: {},
      async execute() {
        const pos = buffer.allText().length
        if (pos === 0) return JSON.stringify({ text: "", consumed: 0 })
        const result = buffer.cutCheckpoint(pos)
        await earsay.setCheckpoint(result.absolutePos)
        return JSON.stringify({ text: result.consumed, consumed: result.consumed.length })
      },
    }),

    voice_status: tool({
      description: "Get the status of the earsay server and the text buffer. Returns server state, buffer length, deadEvents count, and SSE connection status.",
      args: {},
      async execute() {
        const s = earsay.isRunning ? await earsay.status() : null
        return JSON.stringify({
          server: s ?? { status: earsay.isRunning ? "starting" : "stopped" },
          buffer: {
            currentTextLength: buffer.allText().length,
            hasUnread: buffer.hasUnread(),
            deadEvents: buffer.getProgressive().deadEvents,
          },
          sseConnected: sse.isConnected,
        })
      },
    }),
  }
}
