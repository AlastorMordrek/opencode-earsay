export interface SSEEvent {
    ticket?: string;
    potential_index: number;
    text: string;
}
export interface SSEClientOptions {
    chars?: number;
    timeout?: number;
    fullchunk?: boolean;
}
export declare class SSEClient {
    private abortController;
    private ticket;
    private connected;
    get isConnected(): boolean;
    subscribe(baseUrl: string, onEvent: (event: SSEEvent) => void, onError?: (err: Error) => void, opts?: SSEClientOptions): Promise<void>;
    unsubscribe(): void;
}
//# sourceMappingURL=sse-client.d.ts.map