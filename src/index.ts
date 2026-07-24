import type { Plugin } from "@opencode-ai/plugin"
import { EarsayManager } from "./earsay-manager"
import { SSEClient } from "./sse-client"
import { TextBuffer } from "./text-buffer"
import { createTools } from "./tools"

const EARSAY_PORT = parseInt(process.env.EARSAY_PORT ?? "3009", 10)
const EARSAY_MODEL = process.env.EARSAY_MODEL ?? "tiny.en"
const SILENCE_TIMEOUT = parseInt(process.env.EARSAY_SILENCE_TIMEOUT ?? "2000", 10)
const CHARS_THRESHOLD = parseInt(process.env.EARSAY_CHARS_THRESHOLD ?? "30", 10)
const AUTO_START = process.env.EARSAY_AUTO_START !== "false"

const earsay = new EarsayManager({ port: EARSAY_PORT, model: EARSAY_MODEL })
const buffer = new TextBuffer(SILENCE_TIMEOUT)
const sse = new SSEClient()

let started = false

async function startBackgroundSSE(): Promise<void> {
  if (started) return
  started = true
  sse.subscribe(
    earsay.baseUrl,
    (event) => {
      if (event.text) buffer.append(event.text)
    },
    (err) => console.warn("[earsay] SSE error:", err.message),
    { chars: CHARS_THRESHOLD, timeout: SILENCE_TIMEOUT },
  )
}

export const OpencodeEarsayPlugin: Plugin = async ({ client }) => {
  if (AUTO_START) {
    const ok = await earsay.ensureRunning()
    if (ok) {
      startBackgroundSSE()
    }
  }

  return {
    tool: createTools({ earsay, buffer, sse }),
  }
}

export default OpencodeEarsayPlugin
