import { execSync, spawn } from "node:child_process"
import fs from "node:fs"

export function which(cmd: string): string | null {
  try {
    const out = execSync(`which ${cmd} 2>/dev/null`, { encoding: "utf-8" }).trim()
    return out || null
  } catch {
    return null
  }
}

export function spawnAsync(args: string[]): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn(args[0], args.slice(1), { stdio: ["pipe", "pipe", "pipe"] })
    let out = ""
    let err = ""
    proc.stdout?.on("data", (c: Buffer) => { out += c.toString() })
    proc.stderr?.on("data", (c: Buffer) => { err += c.toString() })
    proc.on("close", (code) => {
      resolve({ ok: code === 0, output: (err || out).trim() })
    })
    proc.on("error", () => {
      resolve({ ok: false, output: (err || out).trim() })
    })
  })
}

export function readDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir)
  } catch {
    return []
  }
}

export function fileExists(path: string): boolean {
  try {
    return fs.statSync(path).isFile()
  } catch {
    return false
  }
}

export function mkdir(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {}
}

export function removeFile(path: string): void {
  try {
    fs.unlinkSync(path)
  } catch {}
}

export function removeDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {}
}

export function writeFile(path: string, content: string): void {
  try {
    fs.writeFileSync(path, content, "utf-8")
  } catch {}
}

export function touch(path: string): void {
  try {
    fs.writeFileSync(path, "", "utf-8")
  } catch {}
}
