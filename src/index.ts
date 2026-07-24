import type { Plugin } from "@opencode-ai/plugin"
import { EarsayManager } from "./earsay-manager"
import { SSEClient } from "./sse-client"
import { TextBuffer } from "./text-buffer"
import { createTools } from "./tools"

const EARSAY_PORT = parseInt(process.env.EARSAY_PORT ?? "3009", 10)
const EARSAY_MODEL = process.env.EARSAY_MODEL ?? "tiny.en"
const SILENCE_TIMEOUT = parseInt(process.env.EARSAY_SILENCE_TIMEOUT ?? "2000", 10)
const CHARS_THRESHOLD = parseInt(process.env.EARSAY_CHARS_THRESHOLD ?? "30", 10)

const earsay = new EarsayManager({ port: EARSAY_PORT, model: EARSAY_MODEL })
const buffer = new TextBuffer()
const sse = new SSEClient()

export const OpencodeEarsayPlugin: Plugin = async () => {
  return {
    tool: createTools({ earsay, buffer, sse }),
  }
}

export default OpencodeEarsayPlugin
