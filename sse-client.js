function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
export class SSEClient {
    abortController = null;
    ticket = null;
    connected = false;
    get isConnected() {
        return this.connected;
    }
    async subscribe(baseUrl, onEvent, onError, opts = {}) {
        this.unsubscribe();
        const ac = new AbortController();
        this.abortController = ac;
        while (!ac.signal.aborted) {
            const params = new URLSearchParams();
            params.set("chars", String(opts.chars ?? 30));
            params.set("timeout", String(opts.timeout ?? 2000));
            if (opts.fullchunk)
                params.set("fullchunk", "true");
            try {
                const response = await fetch(`${baseUrl}/subscribe?${params}`, {
                    method: "POST",
                    signal: ac.signal,
                });
                if (!response.ok) {
                    throw new Error(`SSE subscription failed: ${response.status}`);
                }
                if (!response.body) {
                    throw new Error("SSE response body is null");
                }
                this.connected = true;
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() ?? "";
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed.startsWith("data: ")) {
                            const raw = trimmed.slice(6);
                            try {
                                const event = JSON.parse(raw);
                                if (event.ticket) {
                                    this.ticket = event.ticket;
                                }
                                onEvent(event);
                            }
                            catch {
                                // skip malformed events
                            }
                        }
                    }
                }
            }
            catch (err) {
                this.connected = false;
                if (ac.signal.aborted)
                    return;
                onError?.(err instanceof Error ? err : new Error(String(err)));
            }
            this.connected = false;
            if (ac.signal.aborted)
                return;
            await sleep(3000);
        }
    }
    unsubscribe() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        this.ticket = null;
        this.connected = false;
    }
}
//# sourceMappingURL=sse-client.js.map