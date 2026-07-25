const EARSAY_REPO_URL = "git+https://github.com/AlastorMordrek/earsay.git"
const COMPATIBLE_PYTHON_RANGE = { min: 10, max: 12 }

interface RunnerResult {
  ok: boolean
  output: string
}

async function run(args: string[], opts?: { timeout?: number }): Promise<RunnerResult> {
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" })
  const decoder = new TextDecoder()
  let stdout = ""
  let stderr = ""
  try {
    for await (const chunk of proc.stdout as ReadableStream<Uint8Array>) {
      stdout += decoder.decode(chunk)
    }
  } catch { /* stream ended */ }
  try {
    for await (const chunk of proc.stderr as ReadableStream<Uint8Array>) {
      stderr += decoder.decode(chunk)
    }
  } catch { /* stream ended */ }
  const code = await proc.exited
  return { ok: code === 0, output: (stderr || stdout).trim() }
}

function testPythonVersion(py: string): string | null {
  const result = Bun.spawnSync([py, "-c", "import sys; v=sys.version_info; print(f'{v.major}.{v.minor}')"])
  if (result.exitCode !== 0) return null
  const version = result.stdout.toString().trim()
  const parts = version.split(".").map(Number)
  if (parts[0] === 3 && parts[1] >= COMPATIBLE_PYTHON_RANGE.min && parts[1] <= COMPATIBLE_PYTHON_RANGE.max) {
    return py
  }
  return null
}

function findCompatiblePython(): string | null {
  // Search PATH
  for (const cmd of ["python3.12", "python3.11", "python3.10", "python3"]) {
    const path = Bun.which(cmd)
    if (path) {
      const ok = testPythonVersion(path)
      if (ok) return ok
    }
  }
  // Search common Homebrew Cellar paths (installed but not linked)
  const home = Bun.env.HOME ?? ""
  const cellarCandidates = [
    "/usr/local/Cellar/python@3.12/*/bin/python3.12",
    "/opt/homebrew/Cellar/python@3.12/*/bin/python3.12",
    "/usr/local/Cellar/python@3.11/*/bin/python3.11",
    "/opt/homebrew/Cellar/python@3.11/*/bin/python3.11",
    "/usr/local/Cellar/python@3.10/*/bin/python3.10",
    "/opt/homebrew/Cellar/python@3.10/*/bin/python3.10",
    `${home}/.pyenv/versions/3.12/bin/python3.12`,
    `${home}/.pyenv/versions/3.11/bin/python3.11`,
    `${home}/.pyenv/versions/3.10/bin/python3.10`,
  ]
  for (const pattern of cellarCandidates) {
    const matches = Bun.spawnSync(["sh", "-c", `ls ${pattern} 2>/dev/null`])
    if (matches.exitCode === 0) {
      const paths = matches.stdout.toString().trim().split("\n")
      for (const p of paths) {
        const trimmed = p.trim()
        if (trimmed) {
          const ok = testPythonVersion(trimmed)
          if (ok) return ok
        }
      }
    }
  }
  return null
}

function ensurePipxAvailable(py: string): boolean {
  const probe = Bun.spawnSync([py, "-m", "pipx", "--version"])
  if (probe.exitCode === 0) return true
  const r = Bun.spawnSync([py, "-m", "pip", "install", "--user", "pipx"])
  if (r.exitCode === 0) {
    return Bun.spawnSync([py, "-m", "pipx", "--version"]).exitCode === 0
  }
  const r2 = Bun.spawnSync([py, "-m", "pip", "install", "--user", "--break-system-packages", "pipx"])
  return r2.exitCode === 0 && Bun.spawnSync([py, "-m", "pipx", "--version"]).exitCode === 0
}

async function installViaPipx(py: string, url: string): Promise<boolean> {
  const r = await run([py, "-m", "pipx", "install", url])
  return r.ok
}

async function tryInstallPipx(py: string, url: string): Promise<boolean> {
  if (!ensurePipxAvailable(py)) return false
  return installViaPipx(py, url)
}

async function downloadUv(): Promise<string | null> {
  const uvDir = `${Bun.env.HOME ?? "~"}/.earsay/bin`
  const uvPath = `${uvDir}/uv`
  if (Bun.which(uvPath)) return uvPath

  // Detect platform
  const uname = Bun.spawnSync(["uname", "-sm"])
  if (uname.exitCode !== 0) return null
  const [kernel, archRaw] = uname.stdout.toString().trim().split(" ")
  const arch = archRaw?.toLowerCase() === "arm64" ? "aarch64" : "x86_64"

  let target: string
  if (kernel === "Darwin") {
    target = `${arch}-apple-darwin`
  } else if (kernel === "Linux") {
    target = `${arch}-unknown-linux-gnu`
  } else {
    return null
  }

  // Fetch latest release tag
  try {
    const req = await fetch(
      "https://api.github.com/repos/astral-sh/uv/releases/latest",
      { headers: { "Accept": "application/json", "User-Agent": "earsay-installer" } },
    )
    if (!req.ok) return null
    const release: any = await req.json()
    const tag = release.tag_name as string

    // Find asset for this platform
    const assetName = `uv-${target}.tar.gz`
    const asset = release.assets?.find((a: any) => a.name === assetName)
    if (!asset) return null
    const url = asset.browser_download_url as string

    console.info("[earsay] downloading uv...")
    const resp = await fetch(url)
    if (!resp.ok || !resp.body) return null

    // Download tarball to temp file, then extract
    Bun.spawnSync(["mkdir", "-p", uvDir])
    const tmpTar = `/tmp/earsay-uv-${Date.now()}.tar.gz`
    const buf = await resp.arrayBuffer()
    Bun.write(tmpTar, new Uint8Array(buf))
    const extract = Bun.spawnSync(["tar", "-xzf", tmpTar, "-C", uvDir])
    Bun.spawnSync(["rm", "-f", tmpTar])
    if (extract.exitCode !== 0) return null
    // uv binary is extracted as ./uv in the target dir
    const extracted = `${uvDir}/uv`
    if (!Bun.which(extracted) && Bun.spawnSync(["test", "-f", extracted]).exitCode !== 0) {
      // Maybe it was extracted into a subdir
      const dirs = Bun.spawnSync(["ls", uvDir])
      const items = dirs.stdout.toString().trim().split("\n")
      const subdir = items.find((d: string) => d.startsWith("uv-"))
      if (subdir) {
        const subUv = `${uvDir}/${subdir}/uv`
        if (Bun.spawnSync(["test", "-f", subUv]).exitCode === 0) {
          Bun.spawnSync(["mv", subUv, extracted])
          Bun.spawnSync(["rm", "-rf", `${uvDir}/${subdir}`])
        }
      }
    }
    console.info("[earsay] uv ready.")
    return extracted
  } catch {
    return null
  }
}

async function installViaUv(uv: string): Promise<boolean> {
  // Install Python 3.12 via uv
  console.info("[earsay] installing Python 3.12 via uv...")
  const pyInstall = await run([uv, "python", "install", "3.12"], { timeout: 120000 })
  if (!pyInstall.ok) {
    console.warn("[earsay] uv python install failed:", pyInstall.output)
    return false
  }

  // Install earsay via uv tool
  console.info("[earsay] installing earsay via uv...")
  const toolInstall = await run([uv, "tool", "install", "--python", "3.12", EARSAY_REPO_URL], { timeout: 120000 })
  if (!toolInstall.ok) {
    console.warn("[earsay] uv tool install failed:", toolInstall.output)
    return false
  }
  // uv adds to PATH via its own shims
  return true
}

export async function ensureEarsayInstalled(): Promise<boolean> {
  if (Bun.which("earsay")) return true

  console.info("[earsay] installing earsay...")

  const compatiblePy = findCompatiblePython()
  if (compatiblePy) {
    console.info("[earsay] using Python:", compatiblePy)
    if (await tryInstallPipx(compatiblePy, EARSAY_REPO_URL)) {
      console.info("[earsay] earsay installed via pipx.")
      return true
    }
    console.warn("[earsay] pipx install failed.")
    // Fall through to uv
  } else {
    const probe = Bun.spawnSync(["python3", "--version"])
    const ver = probe.exitCode === 0 ? probe.stdout.toString().trim() : "unknown"
    console.warn("[earsay] no compatible Python (3.10-3.12) found. Current:", ver)
  }

  // Fallback: download uv, use it to get Python 3.12 and install earsay
  const uv = await downloadUv()
  if (uv) {
    if (await installViaUv(uv)) {
      console.info("[earsay] earsay installed via uv.")
      // uv stores tools in ~/.local/bin
      const earsayPath = `${Bun.env.HOME ?? "~"}/.local/bin/earsay`
      if (Bun.which(earsayPath)) {
        return true
      }
      // Check if uv put it in its venvs directory
      const uvEarsay = await run([uv, "tool", "dir"])
      if (uvEarsay.ok) {
        const toolBin = `${uvEarsay.output.trim()}/earsay/bin/earsay`
        if (Bun.which(toolBin)) return true
      }
      // Try to find it
      const findResult = await run(["find", `${Bun.env.HOME ?? "~"}`, "-name", "earsay", "-type", "f", "-maxdepth", "5"])
      if (findResult.ok && findResult.output.length > 0) {
        const first = findResult.output.split("\n")[0].trim()
        if (first) {
          // Symlink to ~/.local/bin
          Bun.spawnSync(["mkdir", "-p", `${Bun.env.HOME ?? "~"}/.local/bin`])
          Bun.spawnSync(["ln", "-sf", first, `${Bun.env.HOME ?? "~"}/.local/bin/earsay`])
          return true
        }
      }
    }
  }

  console.warn("[earsay] could not install automatically.")
  console.warn("[earsay] 1. Install Python 3.12 via: brew install python@3.12")
  console.warn("[earsay] 2. Then: pipx install", EARSAY_REPO_URL)
  return false
}
