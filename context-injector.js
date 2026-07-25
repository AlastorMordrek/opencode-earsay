import { writeLog } from "./util";
const TRIGGER_TEXT_EVENTS = 3;
const TRIGGER_SILENCE_EVENTS = 3;
const TICK_INTERVAL_MS = 1000;
const SESSION_RETRY_TICKS = 5;
export class ContextInjector {
    buffer;
    earsay;
    client;
    timer = null;
    sessionID = null;
    lastInjected = "";
    lastTriggerTextLength = 0;
    ticksSinceSessionRetry = 0;
    constructor(buffer, earsay, client) {
        this.buffer = buffer;
        this.earsay = earsay;
        this.client = client;
    }
    setSessionID(id) {
        this.sessionID = id;
    }
    start() {
        this.timer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
    }
    stop() {
        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    async tick() {
        const prog = this.buffer.getProgressive();
        const { text, deadEvents, textEvents } = prog;
        if (!this.sessionID) {
            this.ticksSinceSessionRetry++;
            if (this.ticksSinceSessionRetry >= SESSION_RETRY_TICKS) {
                this.ticksSinceSessionRetry = 0;
                await this.retrySessionID();
            }
            if (!this.sessionID)
                return;
        }
        // inject new text as [Voice]: noReply
        if (textEvents > 0 && text.length > this.lastInjected.length) {
            const delta = text.slice(this.lastInjected.length);
            if (delta.length > 0) {
                writeLog(`injecting ${delta.length} chars`);
                await this.injectNoReply(delta);
                this.lastInjected = text;
            }
        }
        // trigger on 3 consecutive text events, or 3 silence events with unharvested text
        const shouldTrigger = textEvents >= TRIGGER_TEXT_EVENTS ||
            (deadEvents >= TRIGGER_SILENCE_EVENTS && text.length > this.lastTriggerTextLength);
        if (shouldTrigger) {
            writeLog(`triggering LLM (textEvents=${textEvents}, deadEvents=${deadEvents}, textLen=${text.length})`);
            await this.triggerLLM();
            this.lastInjected = text;
            this.lastTriggerTextLength = text.length;
            this.buffer.resetCounters();
        }
    }
    async retrySessionID() {
        try {
            const sessions = await this.client.session.list();
            const list = Array.isArray(sessions) ? sessions : sessions?.data ?? [];
            if (list.length > 0) {
                const latest = list[list.length - 1];
                if (latest?.id) {
                    this.sessionID = latest.id;
                    writeLog(`session ID retry success: ${latest.id}`);
                }
            }
        }
        catch {
            // session server not ready yet
        }
    }
    async injectNoReply(delta) {
        try {
            await this.client.session.prompt({
                path: { id: this.sessionID },
                body: {
                    noReply: true,
                    parts: [{ type: "text", text: `[Voice]: ${delta}` }],
                },
            });
        }
        catch (err) {
            writeLog(`injectNoReply failed: ${err}`);
        }
    }
    async triggerLLM() {
        try {
            await this.client.session.prompt({
                path: { id: this.sessionID },
                body: {
                    parts: [{ type: "text", text: "" }],
                },
            });
        }
        catch (err) {
            writeLog(`triggerLLM failed: ${err}`);
        }
    }
}
//# sourceMappingURL=context-injector.js.map