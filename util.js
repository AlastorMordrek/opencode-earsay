import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
export function which(cmd) {
    try {
        const out = execSync(`which ${cmd} 2>/dev/null`, { encoding: "utf-8" }).trim();
        return out || null;
    }
    catch {
        return null;
    }
}
export function spawnAsync(args) {
    return new Promise((resolve) => {
        const proc = spawn(args[0], args.slice(1), { stdio: ["pipe", "pipe", "pipe"] });
        let out = "";
        let err = "";
        proc.stdout?.on("data", (c) => { out += c.toString(); });
        proc.stderr?.on("data", (c) => { err += c.toString(); });
        proc.on("close", (code) => {
            resolve({ ok: code === 0, output: (err || out).trim() });
        });
        proc.on("error", () => {
            resolve({ ok: false, output: (err || out).trim() });
        });
    });
}
export function readDir(dir) {
    try {
        return fs.readdirSync(dir);
    }
    catch {
        return [];
    }
}
export function fileExists(path) {
    try {
        return fs.statSync(path).isFile();
    }
    catch {
        return false;
    }
}
export function mkdir(dir) {
    try {
        fs.mkdirSync(dir, { recursive: true });
    }
    catch { }
}
export function removeFile(path) {
    try {
        fs.unlinkSync(path);
    }
    catch { }
}
export function removeDir(dir) {
    try {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    catch { }
}
export function writeFile(path, content) {
    try {
        fs.writeFileSync(path, content, "utf-8");
    }
    catch { }
}
export function touch(path) {
    try {
        fs.writeFileSync(path, "", "utf-8");
    }
    catch { }
}
export function writeLog(msg) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    const paths = [`${process.env.HOME}/.earsay/plugin.log`, "/tmp/earsay-plugin.log"];
    for (const p of paths) {
        try {
            fs.appendFileSync(p, line, "utf-8");
            return;
        }
        catch { }
    }
}
//# sourceMappingURL=util.js.map