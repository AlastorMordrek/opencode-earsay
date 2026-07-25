export interface SSEEvent {
  ticket?: string
  potential_index: number
  text: string
  trigger: "chars" | "timeout"
}

export interface SSEClientOptions {
  chars?: number
  timeout?: number
  fullchunk?: boolean
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export class SSEClient {
  private abortController: AbortController | null = null
  private ticket: string | null = null
  private connected = false

  get isConnected(): boolean {
    return this.connected
  }

  async subscribe(
    baseUrl: string,
    onEvent: (event: SSEEvent) => void,
    onError?: (err: Error) => void,
    opts: SSEClientOptions = {},
  ): Promise<void> {
    this.unsubscribe()

    const ac = new AbortController()
    this.abortController = ac

    while (!ac.signal.aborted) {
      const params = new URLSearchParams()
      params.set("chars", String(opts.chars ?? 30))
      params.set("timeout", String(opts.timeout ?? 2000))
      if (opts.fullchunk) params.set("fullchunk", "true")

      try {
        const response = await fetch(`${baseUrl}/subscribe?${params}`, {
          method: "POST",
          signal: ac.signal,
        })

        if (!response.ok) {
          throw new Error(`SSE subscription failed: ${response.status}`)
        }

        if (!response.body) {
          throw new Error("SSE response body is null")
        }

        this.connected = true
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""

          for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed.startsWith("data: ")) {
              const raw = trimmed.slice(6)
              try {
                const event = JSON.parse(raw) as SSEEvent
                if (event.ticket) {
                  this.ticket = event.ticket
                }
                onEvent(event)
              } catch {
                // skip malformed events
              }
            }
          }
        }
      } catch (err) {
        this.connected = false
        if (ac.signal.aborted) return
        onError?.(err instanceof Error ? err : new Error(String(err)))
      }

      this.connected = false
      if (ac.signal.aborted) return

      await sleep(3000)
    }
  }

  unsubscribe(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.ticket = null
    this.connected = false
  }
}
