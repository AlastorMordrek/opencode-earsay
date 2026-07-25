import { EarsayManager } from "./earsay-manager";
import { SSEClient } from "./sse-client";
import { TextBuffer } from "./text-buffer";
import { ContextInjector } from "./context-injector";
import { ensureEarsayInstalled } from "./installer";
import { createTools } from "./tools";
import { writeLog } from "./util";
const EARSAY_PORT = parseInt(process.env.EARSAY_PORT ?? "3009", 10);
const EARSAY_MODEL = process.env.EARSAY_MODEL ?? "tiny.en";
const CHARS_THRESHOLD = parseInt(process.env.EARSAY_CHARS_THRESHOLD ?? "30", 10);
const AUTO_INSTALL = process.env.EARSAY_AUTO_INSTALL !== "false";
const AUTO_START = process.env.EARSAY_AUTO_START !== "false";
const earsay = new EarsayManager({ port: EARSAY_PORT, model: EARSAY_MODEL });
const buffer = new TextBuffer();
const sse = new SSEClient();
let injector = null;
export const OpencodeEarsayPlugin = async ({ client }) => {
    // Fire-and-forget: init work must never block opencode's boot
    void (async () => {
        try {
            if (AUTO_INSTALL) {
                await ensureEarsayInstalled();
            }
            if (AUTO_START) {
                const ok = await earsay.start();
                if (ok) {
                    sse.subscribe(earsay.baseUrl, (event) => buffer.onEvent(event.text || ""), (err) => writeLog(`SSE error: ${err.message}`), { chars: CHARS_THRESHOLD, timeout: 3000, fullchunk: false });
                    writeLog("active");
                }
            }
            injector = new ContextInjector(buffer, earsay, client);
            injector.start();
            try {
                const sessions = await Promise.race([
                    client.session.list(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
                ]);
                const list = Array.isArray(sessions) ? sessions : sessions?.data ?? [];
                if (list.length > 0) {
                    const latest = list[list.length - 1];
                    if (latest?.id)
                        injector.setSessionID(latest.id);
                }
            }
            catch {
                // event hook will pick it up
            }
        }
        catch (err) {
            writeLog(`init error (plugin continues): ${err}`);
        }
    })();
    return {
        tool: createTools({ earsay, buffer, sse }),
        event: async ({ event }) => {
            const sid = event.properties?.info?.id ?? event.properties?.id;
            if (sid && (event.type === "session.created" || event.type === "session.updated")) {
                injector?.setSessionID(sid);
            }
        },
    };
};
export default OpencodeEarsayPlugin;
//# sourceMappingURL=index.js.map