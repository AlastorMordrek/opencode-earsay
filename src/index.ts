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
const EARSAY_INSTALL_URL = process.env.EARSAY_INSTALL_URL ?? "git+https://github.com/AlastorMordrek/earsay.git"

const earsay = new EarsayManager({ port: EARSAY_PORT, model: EARSAY_MODEL })
const buffer = new TextBuffer()
const sse = new SSEClient()

export const OpencodeEarsayPlugin: Plugin = async () => {
  if (AUTO_INSTALL) {
    const bin = Bun.which("earsay")
    if (!bin) {
      const readAll = async (stream: ReadableStream | null) => {
        if (!stream) return ""
        const decoder = new TextDecoder()
        let text = ""
        for await (const chunk of stream as ReadableStream<Uint8Array>) {
          text += decoder.decode(chunk)
        }
        return text.trim()
      }
      const runners = [
        { bin: "pipx", args: ["pipx", "install", EARSAY_INSTALL_URL] },
        { bin: "pip3", args: ["pip3", "install", EARSAY_INSTALL_URL] },
        { bin: "pip", args: ["pip", "install", EARSAY_INSTALL_URL] },
      ]
      let installed = false
      for (const runner of runners) {
        if (!Bun.which(runner.bin)) continue
        console.info(`[earsay] earsay not found. Installing via ${runner.bin} (may take a minute)...`)
        const proc = Bun.spawn(runner.args, { stdout: "pipe", stderr: "pipe" })
        const [so, se] = await Promise.all([readAll(proc.stdout), readAll(proc.stderr)])
        const code = await proc.exited
        if (code === 0) {
          console.info("[earsay] earsay installed successfully via", runner.bin)
          installed = true
          break
        }
        console.warn(`[earsay] ${runner.bin} failed:`, se || so || "unknown error")
      }
      if (!installed) {
        console.warn("[earsay] could not install earsay automatically.")
        console.warn("[earsay] manually run: pipx install", EARSAY_INSTALL_URL)
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
