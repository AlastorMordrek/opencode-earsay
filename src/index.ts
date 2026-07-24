import type { Plugin } from "@opencode-ai/plugin"
import { EarsayManager } from "./earsay-manager"
import { SSEClient } from "./sse-client"
import { TextBuffer } from "./text-buffer"
import { createTools } from "./tools"

const EARSAY_PORT = parseInt(process.env.EARSAY_PORT ?? "3009", 10)
const EARSAY_MODEL = process.env.EARSAY_MODEL ?? "tiny.en"
const CHARS_THRESHOLD = parseInt(process.env.EARSAY_CHARS_THRESHOLD ?? "30", 10)
const AUTO_INSTALL = process.env.EARSAY_AUTO_INSTALL !== "false"
const AUTO_START = process.env.EARSAY_AUTO_START !== "false"

const earsay = new EarsayManager({ port: EARSAY_PORT, model: EARSAY_MODEL })
const buffer = new TextBuffer()
const sse = new SSEClient()

export const OpencodeEarsayPlugin: Plugin = async () => {
  if (AUTO_INSTALL) {
    const bin = Bun.which("earsay")
    if (!bin) {
      console.info("[earsay] earsay not found. Installing via pip (may take a minute)...")
      const proc = Bun.spawn(["pip", "install", "earsay", "-q"], {
        stdout: "pipe",
        stderr: "pipe",
      })
      const readAll = async (stream: ReadableStream | null) => {
        if (!stream) return ""
        const decoder = new TextDecoder()
        let text = ""
        for await (const chunk of stream as ReadableStream<Uint8Array>) {
          text += decoder.decode(chunk)
        }
        return text.trim()
      }
      const [stdout, stderr] = await Promise.all([readAll(proc.stdout), readAll(proc.stderr)])
      const exitCode = await proc.exited
      if (exitCode === 0) {
        console.info("[earsay] earsay installed successfully.")
      } else {
        const msg = stderr || stdout || "unknown error"
        console.warn("[earsay] pip install failed:", msg)
      }
    }
  }

  if (AUTO_START) {
    const ok = await earsay.start()
    if (ok) {
      sse.subscribe(
        earsay.baseUrl,
        (event) => buffer.onEvent(event.text || ""),
        (err) => console.warn("[earsay] SSE error:", err.message),
        { chars: CHARS_THRESHOLD, timeout: 3000, fullchunk: true },
      )
      console.info("[earsay] voice input active. Events streaming into buffer.")
    }
  }

  return {
    tool: createTools({ earsay, buffer, sse }),
  }
}

export default OpencodeEarsayPlugin
