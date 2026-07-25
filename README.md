# opencode-earsay

Voice-operated OpenCode plugin. Speak naturally — the plugin transcribes your
microphone, feeds the text into the LLM's context, and triggers the agent to
act when enough speech has accumulated.

---

## Quick Start

```bash
git clone https://github.com/AlastorMordrek/opencode-earsay.git
cd opencode-earsay
npm install && npm run build
./deploy.sh
```

Add the skill to your OpenCode config (`~/.config/opencode/opencode.jsonc`):

```jsonc
{
  "instructions": [
    "~/.config/opencode/skills/earsay/SKILL.md"
  ]
}
```

Restart opencode. Speak. The LLM sees `[Voice]:` messages in context and
responds to your commands.

---

## Prerequisites

- OpenCode ≥ 1.3.13
- Working microphone (built-in, USB, or Bluetooth)

No Python, uv, or earsay to install beforehand — the plugin downloads and
manages its own Python 3.12 and the EarSay STT daemon automatically.

---

## Installation

### Option 1: Deploy script (recommended)

```bash
git clone https://github.com/AlastorMordrek/opencode-earsay.git
cd opencode-earsay
npm install && npm run build
./deploy.sh
```

Then add the skill line shown above to `opencode.jsonc` and restart.

### Option 2: Manual install

```bash
git clone https://github.com/AlastorMordrek/opencode-earsay.git
cd opencode-earsay
npm install && npm run build

mkdir -p ~/.config/opencode/plugins/opencode-earsay-lib
cp dist/*.js dist/*.d.ts ~/.config/opencode/plugins/opencode-earsay-lib/

cat > ~/.config/opencode/plugins/opencode-earsay.js <<'PLUGINEOF'
import { OpencodeEarsayPlugin } from "./opencode-earsay-lib/index.js"
export default OpencodeEarsayPlugin
export { OpencodeEarsayPlugin }
PLUGINEOF

mkdir -p ~/.config/opencode/skills/earsay
cp skills/earsay/SKILL.md ~/.config/opencode/skills/earsay/SKILL.md
```

Edit `~/.config/opencode/opencode.jsonc` and add the skill line to the
`"instructions"` array (shown above). Restart opencode.

---

## Usage

Nothing to start. Once opencode restarts, the plugin is live.

- **Speak** — the plugin transcribes and injects `[Voice]:` text into the
  session context as `noReply` messages. The server splits utterances into
  30-character chunks (configurable via `EARSAY_CHARS_THRESHOLD`), so
  injections fire at ~90-character intervals during continuous speech.
- **LLM triggers** — after 3 text events (~90 chars) arrive, or after 5
  seconds of silence (1 silence event), the LLM is woken up with the
  accumulated voice text in context.
- **Stop listening** — say "stop listening". The LLM calls `voice_pause`.
  The microphone is released and events freeze.
- **Resume listening** — type a resume command. The mic was paused so you
  can't speak to resume.

---

## How It Works

Three components work together:

**EarSay** (STT daemon) — a Python process that captures microphone audio,
runs it through faster-whisper, and makes the transcription available via an
HTTP API with Server-Sent Events. The plugin auto-installs it on first load
(tries pipx first, falls back to uv → Python 3.12 → uv tool install).

**SSE client** — subscribes to EarSay's event stream. Each chunk of
transcribed text arrives as an SSE event. The stream auto-reconnects on
disconnect with a 3-second retry delay.

**Text buffer** — accumulates incoming text chunks. Tracks how many
consecutive text events and silence (empty) events have arrived. Supports
checkpoint operations that let the LLM mark portions as consumed.

**Event handler** — fires immediately on each SSE event. If new text arrived,
it injects a `[Voice]:` message into the session (as `noReply` so it doesn't
visibly affect the TUI). Events carry a `trigger` field (`"chars"` or
`"timeout"`) so the buffer classifies them by why they fired, not by text
content. When the text has grown AND enough events have accumulated (3 text
events or 1 silence event), it triggers an LLM turn with an empty user
prompt — the voice messages are already in context for the LLM to analyze.
Text events accumulate across timeout boundaries so pauses between utterances
don't reset the counter. If speech starts before a session exists, text
buffers until the session becomes available, then flushes in one shot.

The LLM sees the conversation history like this:

```
User [Voice]: create a new api
User [Voice]:  endpoint for users
User [Voice]:  with jwt auth
User:     ← empty trigger prompt
```

The LLM decides: is this a complete request? Call `voice_cut_checkpoint` to
claim the first N characters. Need more context? Respond with "waiting for
more input". Multiple requests chained? Cut one at a time.

---

## Tools

| Tool | Purpose |
|------|---------|
| `voice_get_progressive` | Read current accumulated text + event counters |
| `voice_cut_checkpoint(N)` | Claim first N chars as a completed actionable item |
| `voice_clear_checkpoint` | Undo the last checkpoint cut, reclaim all text |
| `voice_consume_all` | Consume all accumulated text at once (clean slate) |
| `voice_pause` | Release microphone (user must type to resume) |
| `voice_resume` | Reopen microphone (only when user types it) |
| `voice_start` | Start the earsay server (auto-started on load) |
| `voice_stop` | Kill the earsay server and release microphone |
| `voice_subscribe` | Reconnect the SSE event stream if it dropped |
| `voice_unsubscribe` | Stop SSE updates |
| `voice_uninstall` | Stop server, check if plugin installed earsay, ask confirmation |
| `voice_uninstall_confirm` | Execute full removal (earsay + Python + plugin files still need manual cleanup) |
| `voice_status` | Server status + buffer state + SSE connection |

---

## Configuration

Environment variables (set before starting opencode):

| Env Var | Default | Description |
|---------|---------|-------------|
| `EARSAY_PORT` | `3009` | HTTP server port |
| `EARSAY_MODEL` | `tiny.en` | Whisper model size |
| `EARSAY_CHARS_THRESHOLD` | `30` | SSE chars threshold for text events |
| `EARSAY_AUTO_INSTALL` | `"true"` | Set to `"false"` to skip auto-install |
| `EARSAY_AUTO_START` | `"true"` | Set to `"false"` to skip auto-start |

---

## Project Structure

```
opencode-earsay/
├── src/
│   ├── index.ts              # Entry — crash-safe init, auto-install/start/SSE
│   ├── installer.ts          # EarSay auto-installer (pipx → uv → manual)
│   ├── earsay-manager.ts     # Subprocess lifecycle + HTTP API proxy
│   ├── sse-client.ts         # SSE subscription with auto-reconnect
│   ├── text-buffer.ts        # Accumulated text + checkpoint management
│   ├── context-injector.ts   # Tick loop: injects [Voice] + triggers LLM
│   ├── tools.ts              # 13 voice tools
│   └── util.ts               # Node.js helpers (which, spawn, file ops, logger)
├── skills/
│   └── earsay/
│       └── SKILL.md          # Teaches the LLM how voice input works
├── deploy.sh                 # One-command deployment
├── package.json
└── README.md
```

---

## Crash Safety

The plugin initializes inside a top-level try-catch. No failure — install
error, server crash, missing binary, unexpected exception — can crash
opencode. The tools are always registered. If the server is down,
`voice_start` retries.

---

## Development

```bash
git clone https://github.com/AlastorMordrek/opencode-earsay.git
cd opencode-earsay
npm install
npm run build     # compile TypeScript → dist/
```

---

## License

MIT
