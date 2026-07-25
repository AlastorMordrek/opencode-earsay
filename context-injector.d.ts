import type { EarsayManager } from "./earsay-manager";
import type { TextBuffer } from "./text-buffer";
export declare class ContextInjector {
    private buffer;
    private earsay;
    private client;
    private timer;
    private sessionID;
    private lastInjected;
    private lastTriggerTextLength;
    private ticksSinceSessionRetry;
    constructor(buffer: TextBuffer, earsay: EarsayManager, client: any);
    setSessionID(id: string | null): void;
    start(): void;
    stop(): void;
    private tick;
    private retrySessionID;
    private injectNoReply;
    private triggerLLM;
}
//# sourceMappingURL=context-injector.d.ts.map