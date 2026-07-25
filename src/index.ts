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
let activeSession: string | null = null
let lastInjectedLength = 0
let lastTriggerTextLength = 0
let attachPromise: Promise<void> | null = null
let wasDeferred = false
let client: any = null

async function attachToSession(sid: string): Promise<void> {
  if (sid === activeSession) {
    writeLog(`[attachToSession] skip — already active for ${sid}`)
    return
  }

  if (attachPromise) {
    writeLog(`[attachToSession] waiting for previous attach to complete`)
    await attachPromise
    if (sid === activeSession) {
      writeLog(`[attachToSession] skip — became active while waiting`)
      return
    }
  }

  if (!earsay.isRunning) {
    sessionID = sid
    activeSession = null
    wasDeferred = true
    sse.unsubscribe()
    buffer.reset()
    writeLog(`[attachToSession] deferred — server not running, sid=${sid}`)
    return
  }

  writeLog(`[attachToSession] enter sid=${sid} from=${activeSession}`)

  sse.unsubscribe()
  buffer.reset()

  activeSession = sid
  sessionID = sid
  lastInjectedLength = 0
  lastTriggerTextLength = 0

  attachPromise = (async () => {
    await earsay.setCheckpoint().catch(() => writeLog(`[attachToSession] checkpoint failed`))
    buffer.reset()

    sse.subscribe(
      earsay.baseUrl,
      onSSEEvent,
      (err) => writeLog(`SSE error: ${err.message}`),
      { chars: CHARS_THRESHOLD, timeout: 3000, fullchunk: false },
    )

    writeLog(`[attachToSession] active for ${sid}`)

    if (wasDeferred) {
      wasDeferred = false
      try {
        await client.session.prompt({
          path: { id: sid },
          body: {
            noReply: true,
            parts: [{ type: "text", text: "[Voice] Earsay server listening..." }],
          },
        })
        writeLog(`[attachToSession] notification injected`)
      } catch (err) {
        writeLog(`[attachToSession] notification failed: ${err}`)
      }
    }
  })()

  await attachPromise
  attachPromise = null
}

async function injectNoReply(delta: string, textLen: number): Promise<void> {
  writeLog(`[inject] enter deltaLen=${delta.length} sessionID=${!!sessionID} lastInjected=${lastInjectedLength}`)
  if (!sessionID) {
    writeLog(`[inject] skip — no session`)
    return
  }
  try {
    await client.session.prompt({
      path: { id: sessionID },
      body: {
        noReply: true,
        parts: [{ type: "text", text: `[Voice]: ${delta}` }],
      },
    })
    lastInjectedLength = textLen
    writeLog(`[inject] success deltaLen=${delta.length} lastInjected=${lastInjectedLength}`)
  } catch (err) {
    writeLog(`[inject] failed: ${err}`)
  }
}

async function triggerLLM(textLength?: number): Promise<void> {
  writeLog(`[trigger] enter sessionID=${!!sessionID} textLen=${textLength} lastTrigger=${lastTriggerTextLength}`)
  if (!sessionID) {
    writeLog(`[trigger] skip — no session`)
    return
  }
  if (textLength !== undefined) {
    lastTriggerTextLength = textLength
    buffer.resetCounters()
  }
  try {
    await client.session.prompt({
      path: { id: sessionID },
      body: {
        parts: [{ type: "text", text: "" }],
      },
    })
    writeLog(`[trigger] success lastTrigger=${lastTriggerTextLength}`)
  } catch (err) {
    writeLog(`[trigger] failed: ${err}`)
  }
}

function checkTrigger(text: string): void {
  const prog = buffer.getProgressive()
  const condTextGrown = text.length > lastTriggerTextLength
  const condTextEv = prog.textEvents >= TRIGGER_TEXT_EVENTS
  const condDeadEv = prog.deadEvents >= TRIGGER_SILENCE_EVENTS
  writeLog(
    `[checkTrigger] textLen=${text.length} lastTrigger=${lastTriggerTextLength} ` +
    `textEv=${prog.textEvents} deadEv=${prog.deadEvents} ` +
    `grown=${condTextGrown} textOk=${condTextEv} deadOk=${condDeadEv} ` +
    `fire=${condTextGrown && (condTextEv || condDeadEv)}`,
  )
  if (condTextGrown && (condTextEv || condDeadEv)) {
    triggerLLM(text.length)
  }
}

function onSSEEvent(event: { text?: string }): void {
  buffer.onEvent(event.text || "")

  const text = buffer.allText()
  const needsInject = text.length > lastInjectedLength
  const delta = needsInject ? text.slice(lastInjectedLength) : ""

  writeLog(
    `[onSSEEvent] eventTextLen=${(event.text || "").length} ` +
    `accLen=${text.length} needsInject=${needsInject} deltaLen=${delta.length} ` +
    `lastInjected=${lastInjectedLength} lastTrigger=${lastTriggerTextLength} sessionID=${!!sessionID}`,
  )

  if (needsInject && delta.length > 0) {
    injectNoReply(delta, text.length).then(() => checkTrigger(text))
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
          writeLog("server active")
          if (sessionID && !activeSession) {
            writeLog(`[init] activating deferred session ${sessionID}`)
            await attachToSession(sessionID)
          }
        }
      }

      if (!sessionID) {
        try {
          const sessions: any = await Promise.race([
            client.session.list(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
          ])
          const list = Array.isArray(sessions) ? sessions : sessions?.data ?? []
          if (list.length > 0) {
            const latest = list[list.length - 1]
            if (latest?.id) await attachToSession(latest.id)
          }
        } catch {
          // event hook will pick it up
        }
      }
    } catch (err) {
      writeLog(`init error (plugin continues): ${err}`)
    }
  })()

  return {
    tool: createTools({ earsay, buffer, sse, onSSEEvent }),
    event: async ({ event }: { event: { type: string; properties: Record<string, unknown> } }) => {
      if (event.type !== "session.created" && event.type !== "session.updated") return
      const info = (event.properties as any)?.info as { id?: string; parentID?: string } | undefined
      if (!info?.id) return
      if (info.parentID) return
      await attachToSession(info.id)
    },
  }
}

export default OpencodeEarsayPlugin
