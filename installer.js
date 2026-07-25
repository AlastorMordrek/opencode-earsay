import { spawnSync } from "node:child_process";
import { which, spawnAsync, readDir, fileExists, mkdir, touch, removeFile, writeLog } from "./util";
const EARSAY_REPO_URL = "git+https://github.com/AlastorMordrek/earsay.git";
const COMPATIBLE_PYTHON_RANGE = { min: 10, max: 12 };
const HOME = process.env.HOME ?? "";
function testPy(py) {
    const r = spawnSync(py, ["-c", "import sys; v=sys.version_info; print(f'{v.major}.{v.minor}')"]);
    if (r.status !== 0)
        return null;
    const [mj, mn] = r.stdout.toString().trim().split(".").map(Number);
    return mj === 3 && mn >= COMPATIBLE_PYTHON_RANGE.min && mn <= COMPATIBLE_PYTHON_RANGE.max ? py : null;
}
function findCompatiblePython() {
    for (const cmd of ["python3.12", "python3.11", "python3.10", "python3"]) {
        const p = which(cmd);
        if (p) {
            const t = testPy(p);
            if (t)
                return t;
        }
    }
    for (const glob of [
        "/usr/local/Cellar/python@3.12/*/bin/python3.12",
        "/opt/homebrew/Cellar/python@3.12/*/bin/python3.12",
        "/usr/local/Cellar/python@3.11/*/bin/python3.11",
        "/opt/homebrew/Cellar/python@3.11/*/bin/python3.11",
        "/usr/local/Cellar/python@3.10/*/bin/python3.10",
        "/opt/homebrew/Cellar/python@3.10/*/bin/python3.10",
        `${HOME}/.pyenv/versions/3.12/bin/python3.12`,
        `${HOME}/.pyenv/versions/3.11/bin/python3.11`,
        `${HOME}/.pyenv/versions/3.10/bin/python3.10`,
    ]) {
        const ls = spawnSync("sh", ["-c", `ls ${glob} 2>/dev/null`]);
        if (ls.status === 0) {
            for (const p of ls.stdout.toString().trim().split("\n")) {
                const t = testPy(p.trim());
                if (t)
                    return t;
            }
        }
    }
    return null;
}
async function downloadUv() {
    const uvDir = `${HOME}/.earsay/bin`;
    const uvPath = `${uvDir}/uv`;
    if (fileExists(uvPath))
        return uvPath;
    if (!which("curl")) {
        writeLog("curl not found");
        return null;
    }
    const [kernel, archRaw] = spawnSync("uname", ["-sm"]).stdout.toString().trim().split(" ");
    const arch = archRaw?.toLowerCase() === "arm64" ? "aarch64" : "x86_64";
    const target = kernel === "Darwin" ? `${arch}-apple-darwin`
        : kernel === "Linux" ? `${arch}-unknown-linux-gnu`
            : null;
    if (!target)
        return null;
    writeLog("downloading uv...");
    const releaseResp = await spawnAsync(["curl", "-sL", "-H", "Accept: application/json",
        "https://api.github.com/repos/astral-sh/uv/releases/latest"]);
    if (!releaseResp.ok)
        return null;
    let release;
    try {
        release = JSON.parse(releaseResp.output);
    }
    catch {
        return null;
    }
    const asset = release.assets?.find((a) => a.name === `uv-${target}.tar.gz`);
    if (!asset)
        return null;
    const tmpTar = `/tmp/earsay-uv-${Date.now()}.tar.gz`;
    const dl = await spawnAsync(["curl", "-sL", "-o", tmpTar, asset.browser_download_url]);
    if (!dl.ok) {
        removeFile(tmpTar);
        return null;
    }
    mkdir(uvDir);
    const ext = spawnSync("tar", ["-xzf", tmpTar, "-C", uvDir]);
    removeFile(tmpTar);
    if (ext.status !== 0)
        return null;
    const items = readDir(uvDir);
    const subdir = items.find((d) => d !== "uv" && d.startsWith("uv-"));
    if (subdir) {
        spawnSync("mv", [`${uvDir}/${subdir}/uv`, uvPath]);
        spawnSync("rm", ["-rf", `${uvDir}/${subdir}`]);
    }
    return fileExists(uvPath) ? uvPath : null;
}
export async function ensureEarsayInstalled() {
    if (which("earsay"))
        return true;
    const py = findCompatiblePython();
    if (py && which("pipx")) {
        writeLog("installing via pipx...");
        const r = await spawnAsync([py, "-m", "pipx", "install", EARSAY_REPO_URL]);
        if (r.ok) {
            mkdir(`${HOME}/.earsay`);
            touch(`${HOME}/.earsay/.plugin-installed`);
            writeLog("earsay installed via pipx");
            return true;
        }
    }
    const uv = await downloadUv();
    if (!uv) {
        writeLog("could not download uv. install earsay manually: git clone https://github.com/AlastorMordrek/earsay.git && cd earsay && ./install.sh");
        return false;
    }
    writeLog("installing Python 3.12 via uv...");
    const pi = await spawnAsync([uv, "python", "install", "3.12"]);
    if (!pi.ok) {
        writeLog(`uv python install failed: ${pi.output}`);
        return false;
    }
    writeLog("installing earsay via uv...");
    const ti = await spawnAsync([uv, "tool", "install", "--python", "3.12", EARSAY_REPO_URL]);
    if (!ti.ok) {
        writeLog(`uv tool install failed: ${ti.output}`);
        return false;
    }
    mkdir(`${HOME}/.earsay`);
    touch(`${HOME}/.earsay/.plugin-installed`);
    return !!which("earsay");
}
//# sourceMappingURL=installer.js.map