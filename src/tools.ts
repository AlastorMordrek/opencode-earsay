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

  async function ensureEarsay(): Promise<boolean> {
    if (earsay.isRunning) return true
    const ok = await earsay.start()
    if (!ok) throw new Error("earsay server not available. Install: pip install earsay")
    return true
  }

  return {
    voice_start: tool({
      description: "Start the earsay transcription server. Call once before using other voice tools.",
      args: {},
      async execute() {
        const ok = await earsay.start()
        if (!ok) return JSON.stringify({ status: "failed", message: "earsay binary not found or failed to start" })
        return JSON.stringify({ status: "started", port: earsay["port"] })
      },
    }),

    voice_stop: tool({
      description: "Stop the earsay transcription server and release the microphone.",
      args: {},
      async execute() {
        await earsay.stop()
        return JSON.stringify({ status: "stopped" })
      },
    }),

    voice_pause: tool({
      description: "Pause transcription. The microphone is released but the server stays alive.",
      args: {},
      async execute() {
        await ensureEarsay()
        const ok = await earsay.pause()
        return JSON.stringify({ status: ok ? "paused" : "failed" })
      },
    }),

    voice_resume: tool({
      description: "Resume transcription after a pause. Re-opens the microphone.",
      args: {},
      async execute() {
        await ensureEarsay()
        const ok = await earsay.resume()
        return JSON.stringify({ status: ok ? "listening" : "failed" })
      },
    }),

    voice_get_new: tool({
      description: "Get text transcribed since the last checkpoint. Use voice_set_checkpoint to mark text as read.",
      args: {},
      async execute() {
        const result = buffer.getNewText()
        return JSON.stringify(result)
      },
    }),

    voice_set_checkpoint: tool({
      description: "Mark all text up to the current position as read. Subsequent calls to voice_get_new will only return text after this position.",
      args: {},
      async execute() {
        const result = buffer.setCheckpoint()
        return JSON.stringify(result)
      },
    }),

    voice_status: tool({
      description: "Get the current status of the earsay server and text buffer.",
      args: {},
      async execute() {
        await ensureEarsay()
        const s = await earsay.status()
        return JSON.stringify({
          server: s ?? { status: "unknown" },
          buffer: {
            totalChars: buffer.allText().length,
            unreadChars: buffer.allText().length - 0,
            hasUnread: buffer.hasUnread(),
          },
          sseConnected: sse.isConnected,
        })
      },
    }),

    voice_activate: tool({
      description: "Activate voice mode. Starts earsay if needed, begins accumulating spoken text. The agent should then progressively check voice_get_progressive each turn.",
      args: {},
      async execute() {
        await ensureEarsay()
        const port = earsay["baseUrl"]
        sse.subscribe(
          port,
          (event) => {
            if (event.text) buffer.append(event.text)
          },
          (err) => console.warn("[earsay] SSE error:", err.message),
          { chars: 30, timeout: 2000 },
        )
        return JSON.stringify({ status: "active", message: "Voice mode activated. Use voice_get_progressive each turn to check for new speech." })
      },
    }),

    voice_deactivate: tool({
      description: "Deactivate voice mode. Stops listening for new speech input.",
      args: {},
      async execute() {
        sse.unsubscribe()
        buffer.reset()
        return JSON.stringify({ status: "inactive" })
      },
    }),

    voice_get_progressive: tool({
      description: "Get progressive voice input status. Returns any new text since last checkpoint plus whether the user has stopped speaking (silent=true). When text is non-empty and silent=true, treat the accumulated text as a user prompt.",
      args: {},
      async execute() {
        const result = buffer.getProgressive()
        return JSON.stringify(result)
      },
    }),
  }
}
