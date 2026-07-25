import type { ChildProcess } from "node:child_process"
import { spawn } from "node:child_process"
import { which } from "./util"

export interface EarsayStatus {
  status: "listening" | "paused" | "stopped"
  uptime_seconds: number
  chars_transcribed: number
  checkpoint_count: number
  subscription_count: number
  port: number
}

export interface EarsayManagerOptions {
  port: number
  model?: string
}

export class EarsayManager {
  private proc: ChildProcess | null = null
  private port: number
  private model: string
  private running = false

  constructor(opts: EarsayManagerOptions) {
    this.port = opts.port
    this.model = opts.model ?? "tiny.en"
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`
  }

  get isRunning(): boolean {
    return this.running
  }

  async start(): Promise<boolean> {
    if (this.running) return true
    const ok = await this.ping()
    if (ok) {
      this.running = true
      return true
    }
    const bin = which("earsay")
    if (!bin) {
      console.warn("[earsay] earsay binary not found. Install: pip install earsay")
      return false
    }
    const proc = spawn(bin, ["listen", "--port", String(this.port), "--model", this.model], {
      stdio: ["pipe", "pipe", "pipe"],
    })
    this.proc = proc
    proc.unref()

    const relayStderr = async () => {
      const stderr = proc.stderr
      if (!stderr) return
      const decoder = new TextDecoder()
      try {
        for await (const chunk of stderr as AsyncIterable<Buffer>) {
          const text = decoder.decode(chunk, { stream: true })
          for (const line of text.split("\n").filter(Boolean)) {
            console.info("[earsay]", line.trimEnd())
          }
        }
      } catch {
        // stderr stream ended
      }
    }
    relayStderr()

    const maxRetries = 90
    const intervalMs = 1000
    for (let i = 0; i < maxRetries; i++) {
      await sleep(intervalMs)
      if (await this.ping()) {
        this.running = true
        console.info("[earsay] server ready on port", this.port)
        return true
      }
      if (this.proc && proc.exitCode !== null) {
        console.warn("[earsay] process exited early with code", proc.exitCode)
        return false
      }
    }
    console.warn("[earsay] server did not respond within 90s")
    return false
  }

  async stop(): Promise<void> {
    if (!this.running) return
    await this.api("POST", "/stop").catch(() => {})
    if (this.proc) {
      const p = this.proc
      p.kill()
      await new Promise<void>((resolve) => {
        p.once("close", () => resolve())
        setTimeout(() => resolve(), 2000)
      }).catch(() => {})
      this.proc = null
    }
    this.running = false
  }

  async pause(): Promise<boolean> {
    const res = await this.api("POST", "/pause")
    return res?.status === "paused"
  }

  async resume(): Promise<boolean> {
    const res = await this.api("POST", "/resume")
    return res?.status === "listening"
  }

  async status(): Promise<EarsayStatus | null> {
    try {
      const res = await this.api("GET", "/status")
      if (!res) return null
      return { ...res, port: this.port } as EarsayStatus
    } catch {
      return null
    }
  }

  async setCheckpoint(absolutePos: number): Promise<boolean> {
    const res = await this.api("POST", `/checkpoint?at=${absolutePos}`)
    return res !== null
  }

  async ensureRunning(): Promise<boolean> {
    if (this.running) return true
    return this.start()
  }

  destroy(): void {
    if (this.proc) {
      this.proc.kill()
      this.proc = null
    }
    this.running = false
  }

  private async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/status`, { signal: AbortSignal.timeout(2000) })
      return res.ok
    } catch {
      return false
    }
  }

  private async api(method: string, path: string): Promise<Record<string, unknown> | null> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) return null
      return (await res.json()) as Record<string, unknown>
    } catch {
      return null
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
