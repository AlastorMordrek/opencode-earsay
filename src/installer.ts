const EARSAY_REPO_URL = "git+https://github.com/AlastorMordrek/earsay.git"
const COMPATIBLE_PYTHON_RANGE = { min: 10, max: 12 }

interface RunnerResult {
  ok: boolean
  output: string
}

async function run(args: string[]): Promise<RunnerResult> {
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" })
  const decoder = new TextDecoder()
  let stdout = ""
  let stderr = ""
  for await (const chunk of proc.stdout as ReadableStream<Uint8Array>) {
    stdout += decoder.decode(chunk)
  }
  for await (const chunk of proc.stderr as ReadableStream<Uint8Array>) {
    stderr += decoder.decode(chunk)
  }
  const code = await proc.exited
  return { ok: code === 0, output: (stderr || stdout).trim() }
}

function findCompatiblePython(): string | null {
  for (const cmd of ["python3.12", "python3.11", "python3.10", "python3"]) {
    const path = Bun.which(cmd)
    if (!path) continue
    const result = Bun.spawnSync([path, "-c", "import sys; v=sys.version_info; print(f'{v.major}.{v.minor}')"])
    if (result.exitCode !== 0) continue
    const version = result.stdout.toString().trim()
    const parts = version.split(".").map(Number)
    if (parts[0] === 3 && parts[1] >= COMPATIBLE_PYTHON_RANGE.min && parts[1] <= COMPATIBLE_PYTHON_RANGE.max) {
      return path
    }
  }
  return null
}

function ensurePipxAvailable(py: string): boolean {
  const probe = Bun.spawnSync([py, "-m", "pipx", "--version"])
  if (probe.exitCode === 0) return true
  const r = Bun.spawnSync([py, "-m", "pip", "install", "--user", "pipx"])
  if (r.exitCode !== 0) {
    Bun.spawnSync([py, "-m", "pip", "install", "--user", "--break-system-packages", "pipx"])
  }
  const retry = Bun.spawnSync([py, "-m", "pipx", "--version"])
  return retry.exitCode === 0
}

async function installViaPipx(py: string, url: string): Promise<boolean> {
  const r = await run([py, "-m", "pipx", "install", url])
  if (r.ok) return true
  // Retry with explicit compatible python argument
  const r2 = await run([py, "-m", "pipx", "install", "--python", py, url])
  return r2.ok
}

async function tryInstallPipx(py: string, url: string): Promise<boolean> {
  if (!ensurePipxAvailable(py)) return false
  return installViaPipx(py, url)
}

async function tryInstallPip(py: string, url: string): Promise<boolean> {
  const r = await run([py, "-m", "pip", "install", url])
  if (r.ok) return true
  const r2 = await run([py, "-m", "pip", "install", "--break-system-packages", url])
  return r2.ok
}

function installPyenv(py: string): boolean {
  console.info("[earsay] installing pyenv via pip...")
  const r = Bun.spawnSync([py, "-m", "pip", "install", "pyenv", "--user"])
  if (r.exitCode === 0) console.info("[earsay] pyenv installed.")
  return r.exitCode === 0
}

function installPythonViaPyenv(): string | null {
  console.info("[earsay] installing Python 3.12 via pyenv (may take a while)...")
  const pyenv = Bun.which("pyenv")
  if (!pyenv) {
    console.warn("[earsay] pyenv not found. Install: brew install pyenv")
    return null
  }
  const installResult = Bun.spawnSync([pyenv, "install", "-s", "3.12"])
  if (installResult.exitCode !== 0) {
    console.warn("[earsay] pyenv install 3.12 failed.")
    return null
  }
  const py312 = `${Bun.env.HOME}/.pyenv/versions/3.12/bin/python3.12`
  if (Bun.which(py312)) return py312
  return null
}

function installPyenvViaBrew(): boolean {
  console.info("[earsay] installing pyenv via Homebrew...")
  const r = Bun.spawnSync(["brew", "install", "pyenv"])
  if (r.exitCode === 0) console.info("[earsay] pyenv installed.")
  return r.exitCode === 0
}

function installPyenvViaGit(): boolean {
  console.info("[earsay] cloning pyenv from GitHub...")
  const r = Bun.spawnSync(["git", "clone", "https://github.com/pyenv/pyenv.git", `${Bun.env.HOME}/.pyenv`])
  if (r.exitCode === 0) {
    const pyenvBin = `${Bun.env.HOME}/pyenv/bin/pyenv`
    process.env.PATH = `${Bun.env.HOME}/pyenv/bin:${process.env.PATH ?? ""}`
    console.info("[earsay] pyenv cloned. Add to PATH and reload shell.")
    return true
  }
  return false
}

export async function ensureEarsayInstalled(): Promise<boolean> {
  if (Bun.which("earsay")) return true

  console.info("[earsay] installing earsay...")

  const compatiblePy = findCompatiblePython()
  if (compatiblePy) {
    if (await tryInstallPipx(compatiblePy, EARSAY_REPO_URL)) {
      console.info("[earsay] earsay installed via pipx.")
      return true
    }
    if (await tryInstallPip(compatiblePy, EARSAY_REPO_URL)) {
      console.info("[earsay] earsay installed via pip (fallback).")
      return true
    }
    console.warn("[earsay] could not install with compatible Python.")
    return false
  }

  console.warn("[earsay] no compatible Python (3.10-3.12) found. Current version:")
  const probe = Bun.spawnSync(["python3", "--version"])
  if (probe.exitCode === 0) console.warn("[earsay]", probe.stdout.toString().trim())

  // Try to install a compatible Python via Homebrew or pyenv
  const brew = Bun.which("brew")
  if (brew) {
    console.info("[earsay] installing Python 3.12 via Homebrew...")
    const r = await run([brew, "install", "python@3.12"])
    if (r.ok) {
      const py312 = Bun.which("python3.12")
      if (py312) {
        if (await tryInstallPipx(py312, EARSAY_REPO_URL)) {
          console.info("[earsay] earsay installed.")
          return true
        }
      }
    }
  }

  // Try pyenv
  if (!Bun.which("pyenv")) {
    if (brew) {
      installPyenvViaBrew()
    } else {
      await run(["pip3", "install", "pyenv", "--user"])
    }
  }

  const py312 = installPythonViaPyenv()
  if (py312) {
    if (await tryInstallPipx(py312, EARSAY_REPO_URL)) {
      console.info("[earsay] earsay installed via pyenv Python 3.12.")
      return true
    }
  }

  console.warn("[earsay] could not install automatically.")
  console.warn("[earsay] install a compatible Python (3.10-3.12):")
  console.warn("  brew install python@3.12")
  console.warn("  # or: pipx install", EARSAY_REPO_URL, "--python python3.12")
  return false
}
