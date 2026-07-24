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
        "Start the earsay speech-to-text server. Idempotent — if already running, does nothing.",
        "Call this once before any other voice tools. The server runs locally on port 3009.",
        "Returns status and port.",
      ].join(" "),
      args: {},
      async execute() {
        const ok = await earsay.start()
        if (!ok) {
          return JSON.stringify({ status: "failed", message: "earsay binary not found or failed to start" })
        }
        return JSON.stringify({ status: "started", port: earsay["baseUrl"] })
      },
    }),

    voice_stop: tool({
      description: "Stop the earsay server entirely. Kills the process and releases the microphone.",
      args: {},
      async execute() {
        await earsay.stop()
        return JSON.stringify({ status: "stopped" })
      },
    }),

    voice_pause: tool({
      description: [
        "Pause transcription. The microphone is released and no events are fired",
        "(including timeout events). The server stays alive. To resume,",
        "the user must type a command — do not call voice_resume autonomously.",
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
        "Resume transcription after a pause. Re-opens the microphone.",
        "IMPORTANT: Only call this when the user explicitly asks to resume via text chat.",
        "Do NOT autonomously resume after pausing.",
      ].join(" "),
      args: {},
      async execute() {
        await ensureEarsay()
        const ok = await earsay.resume()
        if (!ok) throw new Error("failed to resume earsay")
        return JSON.stringify({ status: "listening" })
      },
    }),

    voice_activate: tool({
      description: [
        "Activate voice mode. Starts a real-time SSE stream from earsay using fullchunk mode.",
        "Each event carries the FULL accumulated text since the last checkpoint (not just deltas).",
        "Call voice_get_progressive each turn to check for new speech.",
        "The LLM analyzes the growing text semantically and decides where to cut with",
        "voice_cut_checkpoint when an actionable item is complete.",
      ].join(" "),
      args: {},
      async execute() {
        await ensureEarsay()
        const baseUrl = earsay["baseUrl"]
        sse.subscribe(
          baseUrl,
          (event) => buffer.onEvent(event.text || ""),
          (err) => console.warn("[earsay] SSE error:", err.message),
          { chars: 30, timeout: 3000, fullchunk: true },
        )
        return JSON.stringify({ status: "active", message: "Voice mode activated. Subscribe to SSE stream started." })
      },
    }),

    voice_deactivate: tool({
      description: [
        "Deactivate voice mode. Unsubscribes from the SSE stream and clears the buffer.",
        "The earsay server stays running (use voice_stop to fully shut down).",
      ].join(" "),
      args: {},
      async execute() {
        sse.unsubscribe()
        buffer.reset()
        return JSON.stringify({ status: "inactive" })
      },
    }),

    voice_get_progressive: tool({
      description: [
        "Get the current voice input state. Returns:",
        "- text: the full accumulated text since the last checkpoint (string)",
        "- deadEvents: number of consecutive SSE events that contained no new text.",
        "  Each event fires after ~3 seconds of silence. 3+ deadEvents ≈ 9 seconds of silence.",
        "- charsSinceCheckpoint: character length of the current text.",
        "- potentialIndex: absolute character position in earsay's buffer.",
        "Use this each turn while voice mode is active. Analyze the text semantically:",
        "if it contains a complete actionable request, call voice_cut_checkpoint to claim it.",
      ].join(" "),
      args: {},
      async execute() {
        return JSON.stringify(buffer.getProgressive())
      },
    }),

    voice_cut_checkpoint: tool({
      description: [
        "Claim the first N characters of the current text as a completed actionable item.",
        "Takes a charPosition within the current progressive text.",
        "The consumed portion (0..charPosition) is returned so you can act on it.",
        "The remaining text (charPosition..end) stays in the buffer for future passes.",
        "This calls earsay's checkpoint API to advance the server-side position.",
        "Example: if text='create user api with get post', calling cutCheckpoint(26)",
        "consumes 'create user api with get post' (or however long 26 chars is).",
        "Use when you have identified a semantically complete request in the text.",
      ].join(" "),
      args: {
        charPosition: tool.schema.number().describe("Character position to cut at. First N chars of the current progressive text become the consumed actionable item. Remaining text stays in the buffer."),
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
      description: [
        "Undo the last checkpoint cut. Resets the buffer so all text is available again.",
        "Use if you cut at the wrong position and need to re-analyze.",
      ].join(" "),
      args: {},
      async execute() {
        buffer.clearCheckpoint()
        return JSON.stringify({ status: "cleared" })
      },
    }),

    voice_set_checkpoint: tool({
      description: [
        "Simple mode: consume all current text at once.",
        "Marks the entire current buffer as read. Use when you want to clear the buffer",
        "without semantic analysis (e.g., at end of session).",
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
      description: "Get the status of the earsay server and the text buffer. Returns server status, buffer length, deadEvents, and SSE connection state.",
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
