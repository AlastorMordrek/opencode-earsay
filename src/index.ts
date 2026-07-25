import type { Plugin } from "@opencode-ai/plugin"
import { EarsayManager } from "./earsay-manager"
import { SSEClient } from "./sse-client"
import { TextBuffer } from "./text-buffer"
import { ensureEarsayInstalled } from "./installer"
import { createTools } from "./tools"
import { writeLog } from "./util"

const EARSAY_PORT = parseInt(process.env.EARSAY_PORT ?? "3009", 10)
const EARSAY_MODEL = process.env.EARSAY_MODEL ?? "tiny.en"
const CHARS_THRESHOLD = parseInt(process.env.EARSAY_CHARS_THRESHOLD ?? "30", 10)
const TRIGGER_TEXT_EVENTS = 3
const TRIGGER_SILENCE_EVENTS = 3
const AUTO_INSTALL = process.env.EARSAY_AUTO_INSTALL !== "false"
const AUTO_START = process.env.EARSAY_AUTO_START !== "false"

const earsay = new EarsayManager({ port: EARSAY_PORT, model: EARSAY_MODEL })
const buffer = new TextBuffer()
const sse = new SSEClient()

let sessionID: string | null = null
let lastInjectedLength = 0
let lastTriggerTextLength = 0
let client: any = null

async function injectNoReply(delta: string): Promise<void> {
  if (!sessionID) return
  try {
    await client.session.prompt({
      path: { id: sessionID },
      body: {
        noReply: true,
        parts: [{ type: "text", text: `[Voice]: ${delta}` }],
      },
    })
    writeLog(`injected ${delta.length} chars`)
  } catch (err) {
    writeLog(`injectNoReply failed: ${err}`)
  }
}

async function triggerLLM(): Promise<void> {
  if (!sessionID) return
  try {
    await client.session.prompt({
      path: { id: sessionID },
      body: {
        parts: [{ type: "text", text: "" }],
      },
    })
    writeLog(`triggered LLM`)
  } catch (err) {
    writeLog(`triggerLLM failed: ${err}`)
  }
}

function checkTrigger(text: string): void {
  const prog = buffer.getProgressive()
  if (
    text.length > lastTriggerTextLength &&
    (prog.textEvents >= TRIGGER_TEXT_EVENTS || prog.deadEvents >= TRIGGER_SILENCE_EVENTS)
  ) {
    lastTriggerTextLength = text.length
    buffer.resetCounters()
    triggerLLM()
  }
}

function onSSEEvent(event: { text?: string }): void {
  buffer.onEvent(event.text || "")

  const text = buffer.allText()
  const needsInject = text.length > lastInjectedLength
  const delta = needsInject ? text.slice(lastInjectedLength) : ""

  if (needsInject && delta.length > 0) {
    lastInjectedLength = text.length
    injectNoReply(delta).then(() => checkTrigger(text))
  } else {
    checkTrigger(text)
  }
}

function setSessionID(sid: string | null): void {
  sessionID = sid
  if (!sid) return
  const text = buffer.allText()
  const needsInject = text.length > lastInjectedLength
  const delta = needsInject ? text.slice(lastInjectedLength) : ""
  if (delta.length > 0) {
    lastInjectedLength = text.length
    injectNoReply(delta).then(() => checkTrigger(text))
  } else {
    checkTrigger(text)
  }
}

export const OpencodeEarsayPlugin: Plugin = async ({ client: c }) => {
  client = c

  void (async () => {
    try {
      if (AUTO_INSTALL) {
        await ensureEarsayInstalled()
      }

      if (AUTO_START) {
        const ok = await earsay.start()
        if (ok) {
          sse.subscribe(
            earsay.baseUrl,
            onSSEEvent,
            (err) => writeLog(`SSE error: ${err.message}`),
            { chars: CHARS_THRESHOLD, timeout: 3000, fullchunk: false },
          )
          writeLog("active")
        }
      }

      try {
        const sessions: any = await Promise.race([
          client.session.list(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
        ])
        const list = Array.isArray(sessions) ? sessions : sessions?.data ?? []
        if (list.length > 0) {
          const latest = list[list.length - 1]
          if (latest?.id) setSessionID(latest.id)
        }
      } catch {
        // event hook will pick it up
      }
    } catch (err) {
      writeLog(`init error (plugin continues): ${err}`)
    }
  })()

  return {
    tool: createTools({ earsay, buffer, sse, onSSEEvent }),
    event: async ({ event }: { event: { type: string; properties: Record<string, unknown> } }) => {
      const sid = (event.properties as any)?.info?.id ?? (event.properties as any)?.id
      if (sid && (event.type === "session.created" || event.type === "session.updated")) {
        setSessionID(sid as string)
      }
    },
  }
}

export default OpencodeEarsayPlugin
