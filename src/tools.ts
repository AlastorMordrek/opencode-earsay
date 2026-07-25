import { tool } from "@opencode-ai/plugin"
import type { EarsayManager } from "./earsay-manager"
import type { TextBuffer } from "./text-buffer"
import type { SSEClient } from "./sse-client"
import { fileExists, removeDir, removeFile } from "./util"
import { spawnSync } from "node:child_process"

export interface ToolDeps {
  earsay: EarsayManager
  buffer: TextBuffer
  sse: SSEClient
}

export function createTools(deps: ToolDeps): Record<string, ReturnType<typeof tool>> {
  const { earsay, buffer, sse } = deps

  async function ensureEarsay(): Promise<boolean> {
    if (earsay.isRunning) return true
    try {
      return await earsay.start()
    } catch (err) {
      console.warn("[earsay] start error:", err)
      return false
    }
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
        const ok = await ensureEarsay()
        if (!ok) return JSON.stringify({ status: "failed", message: "earsay unavailable" })
        return JSON.stringify({ status: "started" })
      },
    }),

    voice_stop: tool({
      description: "Stop the earsay server entirely. Kills the process and releases the microphone.",
      args: {},
      async execute() {
        try {
          await earsay.stop()
          return JSON.stringify({ status: "stopped" })
        } catch (err) {
          return JSON.stringify({ status: "error", message: String(err) })
        }
      },
    }),

    voice_pause: tool({
      description: [
        "Pause the microphone. The server stays alive but no audio is captured and",
        "no events fire (including timeout events). The buffer freezes.",
        "Only call this when the user explicitly asks to stop listening.",
        "After pausing, the user must TYPE a resume command — do NOT resume autonomously.",
      ].join(" "),
      args: {},
      async execute() {
        if (!await ensureEarsay()) return JSON.stringify({ status: "error", message: "server not running" })
        try {
          const ok = await earsay.pause()
          return JSON.stringify({ status: ok ? "paused" : "error" })
        } catch (err) {
          return JSON.stringify({ status: "error", message: String(err) })
        }
      },
    }),

    voice_resume: tool({
      description: [
        "Resume the microphone after a pause. Re-opens audio capture and events resume flowing.",
        "CRITICAL: Only call this when the user explicitly types a resume command.",
        "Do NOT call this autonomously.",
      ].join(" "),
      args: {},
      async execute() {
        if (!await ensureEarsay()) return JSON.stringify({ status: "error", message: "server not running" })
        try {
          const ok = await earsay.resume()
          return JSON.stringify({ status: ok ? "listening" : "error" })
        } catch (err) {
          return JSON.stringify({ status: "error", message: String(err) })
        }
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
        if (!await ensureEarsay()) return JSON.stringify({ status: "error", message: "server not running" })
        try {
          sse.subscribe(
            earsay.baseUrl,
            (event) => buffer.onEvent(event.text || ""),
            (err) => console.warn("[earsay] SSE error:", err.message),
            { chars: 30, timeout: 3000, fullchunk: true },
          )
          return JSON.stringify({ status: "subscribed" })
        } catch (err) {
          return JSON.stringify({ status: "error", message: String(err) })
        }
      },
    }),

    voice_unsubscribe: tool({
      description: "Unsubscribe from the SSE event stream. Stops buffer updates. Use voice_subscribe to reconnect.",
      args: {},
      async execute() {
        try {
          sse.unsubscribe()
          return JSON.stringify({ status: "unsubscribed" })
        } catch (err) {
          return JSON.stringify({ status: "error", message: String(err) })
        }
      },
    }),

    voice_get_progressive: tool({
      description: [
        "Get the current voice input state. PRIMARY tool for speech input.",
        "Buffer is always being populated — call this each turn.",
        "Returns: text (accumulated text since last checkpoint),",
        "deadEvents (consecutive empty events),",
        "textEvents (consecutive text-bearing events),",
        "charsSinceCheckpoint.",
        "The plugin autonomously injects [Voice]: messages into context",
        "and triggers LLM turns. Use this tool for detailed analysis",
        "and voice_cut_checkpoint to claim actionable text.",
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
        "Remaining text (charPosition..end) stays in the buffer for next pass.",
        "Calls earsay's checkpoint API server-side.",
        "Use when you have identified a semantically complete request in the text.",
      ].join(" "),
      args: {
        charPosition: tool.schema.number().describe("Character position to cut at. First N chars of the current text become the consumed actionable item. Remaining text stays for the next pass."),
      },
      async execute(args) {
        try {
          const { consumed, remaining, absolutePos } = buffer.cutCheckpoint(args.charPosition)
          await earsay.setCheckpoint(absolutePos)
          return JSON.stringify({
            consumed,
            remaining,
            absolutePos,
            consumedLength: consumed.length,
            remainingLength: remaining.length,
          })
        } catch (err) {
          return JSON.stringify({ status: "error", message: String(err) })
        }
      },
    }),

    voice_clear_checkpoint: tool({
      description: "Undo the last checkpoint cut. Resets the buffer reclaiming all text. Use if you cut at the wrong position and need to re-analyze from scratch.",
      args: {},
      async execute() {
        try {
          buffer.clearCheckpoint()
          return JSON.stringify({ status: "cleared" })
        } catch (err) {
          return JSON.stringify({ status: "error", message: String(err) })
        }
      },
    }),

    voice_consume_all: tool({
      description: "Consume all current text at once. Marks the entire buffer as read. Use for clean slate.",
      args: {},
      async execute() {
        try {
          const pos = buffer.allText().length
          if (pos === 0) return JSON.stringify({ text: "", consumed: 0 })
          const result = buffer.cutCheckpoint(pos)
          await earsay.setCheckpoint(result.absolutePos)
          return JSON.stringify({ text: result.consumed, consumed: result.consumed.length })
        } catch (err) {
          return JSON.stringify({ status: "error", message: String(err) })
        }
      },
    }),

    voice_uninstall: tool({
      description: [
        "Uninstall the voice plugin and optionally earsay itself.",
        "Stops the server, checks whether this plugin installed earsay",
        "(via a marker file), and asks for confirmation before removing earsay.",
        "If earsay pre-existed before this plugin, it is left intact.",
        "Run voice_uninstall_confirm after this tool to proceed with removal.",
      ].join(" "),
      args: {},
      async execute() {
        try {
          if (earsay.isRunning) await earsay.stop()
          const home = process.env.HOME ?? ""
          const markerPath = `${home}/.earsay/.plugin-installed`
          if (fileExists(markerPath)) {
            return JSON.stringify({
              status: "needs_confirm",
              message: "This plugin installed earsay. Remove earsay too?",
              confirmTool: "voice_uninstall_confirm",
            })
          }
          return JSON.stringify({
            status: "done",
            message: "Plugin stopped. earsay left intact (pre-existed or manually installed).",
          })
        } catch (err) {
          return JSON.stringify({ status: "error", message: String(err) })
        }
      },
    }),

    voice_uninstall_confirm: tool({
      description: [
        "Confirm and execute full earsay removal.",
        "Only run this after voice_uninstall asked for confirmation.",
        "Removes: earsay via uv tool, Python 3.12 via uv, ~/.earsay/, ~/.local/bin/earsay.",
      ].join(" "),
      args: {},
      async execute() {
        try {
          if (earsay.isRunning) await earsay.stop()
          const home = process.env.HOME ?? ""
          const uv = `${home}/.earsay/bin/uv`

          if (fileExists(uv)) {
            spawnSync(uv, ["tool", "uninstall", "earsay"])
            spawnSync(uv, ["python", "uninstall", "3.12"])
          }

          removeDir(`${home}/.earsay`)
          removeFile(`${home}/.local/bin/earsay`)

          return JSON.stringify({
            status: "done",
            message: "earsay removed. Remove plugin files from ~/.config/opencode/plugins/ to finish.",
          })
        } catch (err) {
          return JSON.stringify({ status: "error", message: String(err) })
        }
      },
    }),

    voice_status: tool({
      description: "Get the status of the earsay server and the text buffer.",
      args: {},
      async execute() {
        try {
          const s = earsay.isRunning ? await earsay.status() : null
          return JSON.stringify({
            server: s ?? { status: earsay.isRunning ? "starting" : "stopped" },
          buffer: {
            currentTextLength: buffer.allText().length,
            hasUnread: buffer.hasUnread(),
            deadEvents: buffer.getProgressive().deadEvents,
            textEvents: buffer.getProgressive().textEvents,
          },
            sseConnected: sse.isConnected,
          })
        } catch (err) {
          return JSON.stringify({ status: "error", message: String(err) })
        }
      },
    }),
  }
}
