import { tool } from "@opencode-ai/plugin";
import type { EarsayManager } from "./earsay-manager";
import type { TextBuffer } from "./text-buffer";
import type { SSEClient } from "./sse-client";
export interface ToolDeps {
    earsay: EarsayManager;
    buffer: TextBuffer;
    sse: SSEClient;
}
export declare function createTools(deps: ToolDeps): Record<string, ReturnType<typeof tool>>;
//# sourceMappingURL=tools.d.ts.map