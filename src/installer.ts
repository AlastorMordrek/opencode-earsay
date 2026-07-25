const EARSAY_REPO_URL = "git+https://github.com/AlastorMordrek/earsay.git"
const COMPATIBLE_PYTHON_RANGE = { min: 10, max: 12 }

async function run(args: string[]): Promise<{ ok: boolean; output: string }> {
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" })
  const decoder = new TextDecoder()
  let out = ""
  try { for await (const c of proc.stdout as ReadableStream<Uint8Array>) { out += decoder.decode(c) } } catch {}
  let err = ""
  try { for await (const c of proc.stderr as ReadableStream<Uint8Array>) { err += decoder.decode(c) } } catch {}
  return { ok: (await proc.exited) === 0, output: (err || out).trim() }
}

function testPy(py: string): string | null {
  const r = Bun.spawnSync([py, "-c", "import sys; v=sys.version_info; print(f'{v.major}.{v.minor}')"])
  if (r.exitCode !== 0) return null
  const [mj, mn] = r.stdout.toString().trim().split(".").map(Number)
  return mj === 3 && mn >= COMPATIBLE_PYTHON_RANGE.min && mn <= COMPATIBLE_PYTHON_RANGE.max ? py : null
}

function findCompatiblePython(): string | null {
  for (const cmd of ["python3.12", "python3.11", "python3.10", "python3"]) {
    const p = Bun.which(cmd)
    if (p) { const t = testPy(p); if (t) return t }
  }
  const home = Bun.env.HOME ?? ""
  for (const glob of [
    "/usr/local/Cellar/python@3.12/*/bin/python3.12",
    "/opt/homebrew/Cellar/python@3.12/*/bin/python3.12",
    "/usr/local/Cellar/python@3.11/*/bin/python3.11",
    "/opt/homebrew/Cellar/python@3.11/*/bin/python3.11",
    "/usr/local/Cellar/python@3.10/*/bin/python3.10",
    "/opt/homebrew/Cellar/python@3.10/*/bin/python3.10",
    `${home}/.pyenv/versions/3.12/bin/python3.12`,
    `${home}/.pyenv/versions/3.11/bin/python3.11`,
    `${home}/.pyenv/versions/3.10/bin/python3.10`,
  ]) {
    const ls = Bun.spawnSync(["sh", "-c", `ls ${glob} 2>/dev/null`])
    if (ls.exitCode === 0) {
      for (const p of ls.stdout.toString().trim().split("\n")) {
        const t = testPy(p.trim())
        if (t) return t
      }
    }
  }
  return null
}

async function downloadUv(): Promise<string | null> {
  const uvDir = `${Bun.env.HOME ?? "~"}/.earsay/bin`
  const uvPath = `${uvDir}/uv`
  if (Bun.which(uvPath)) return uvPath
  if (!Bun.which("curl")) { console.warn("[earsay] curl not found"); return null }

  const [kernel, archRaw] = Bun.spawnSync(["uname", "-sm"]).stdout.toString().trim().split(" ")
  const arch = archRaw?.toLowerCase() === "arm64" ? "aarch64" : "x86_64"
  const target = kernel === "Darwin" ? `${arch}-apple-darwin`
    : kernel === "Linux" ? `${arch}-unknown-linux-gnu`
    : null
  if (!target) return null

  console.info("[earsay] downloading uv...")
  const releaseResp = await run(["curl", "-sL", "-H", "Accept: application/json",
    "https://api.github.com/repos/astral-sh/uv/releases/latest"])
  if (!releaseResp.ok) return null
  let release: any
  try { release = JSON.parse(releaseResp.output) } catch { return null }
  const asset = release.assets?.find((a: any) => a.name === `uv-${target}.tar.gz`)
  if (!asset) return null

  const tmpTar = `/tmp/earsay-uv-${Date.now()}.tar.gz`
  const dl = await run(["curl", "-sL", "-o", tmpTar, asset.browser_download_url])
  if (!dl.ok) { Bun.spawnSync(["rm", "-f", tmpTar]); return null }

  Bun.spawnSync(["mkdir", "-p", uvDir])
  const ext = Bun.spawnSync(["tar", "-xzf", tmpTar, "-C", uvDir])
  Bun.spawnSync(["rm", "-f", tmpTar])
  if (ext.exitCode !== 0) return null

  const items = Bun.spawnSync(["ls", uvDir]).stdout.toString().trim().split("\n")
  const subdir = items.find((d: string) => d !== "uv" && d.startsWith("uv-"))
  if (subdir) {
    Bun.spawnSync(["mv", `${uvDir}/${subdir}/uv`, uvPath])
    Bun.spawnSync(["rm", "-rf", `${uvDir}/${subdir}`])
  }
  return Bun.which(uvPath) ? uvPath : null
}

export async function ensureEarsayInstalled(): Promise<boolean> {
  if (Bun.which("earsay")) return true

  const py = findCompatiblePython()
  if (py && Bun.which("pipx")) {
    console.info("[earsay] installing via pipx...")
    const r = await run([py, "-m", "pipx", "install", EARSAY_REPO_URL])
    if (r.ok) {
      Bun.spawnSync(["mkdir", "-p", `${Bun.env.HOME}/.earsay`])
      Bun.spawnSync(["touch", `${Bun.env.HOME}/.earsay/.plugin-installed`])
      console.info("[earsay] earsay installed.")
      return true
    }
  }

  const uv = await downloadUv()
  if (!uv) {
    console.warn("[earsay] could not download uv.")
    console.warn("[earsay] install earsay manually:")
    console.warn("  git clone https://github.com/AlastorMordrek/earsay.git")
    console.warn("  cd earsay && ./install.sh")
    return false
  }

  console.info("[earsay] installing Python 3.12 via uv...")
  const pi = await run([uv, "python", "install", "3.12"])
  if (!pi.ok) { console.warn("[earsay] uv python install failed:", pi.output); return false }

  console.info("[earsay] installing earsay via uv...")
  const ti = await run([uv, "tool", "install", "--python", "3.12", EARSAY_REPO_URL])
  if (!ti.ok) { console.warn("[earsay] uv tool install failed:", ti.output); return false }

  Bun.spawnSync(["mkdir", "-p", `${Bun.env.HOME}/.earsay`])
  Bun.spawnSync(["touch", `${Bun.env.HOME}/.earsay/.plugin-installed`])

  return !!Bun.which("earsay")
}
