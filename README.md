# opencode-earsay

OpenCode plugin for always-on continuous voice input via [EarSay](https://github.com/AlastorMordrek/earsay).

The plugin auto-installs the EarSay STT daemon (Python + faster-whisper), starts it, subscribes to the live transcription stream, and injects `[Voice]:` messages into the session context. After enough speech arrives, it triggers an LLM turn. The LLM analyzes the accumulated text and decides whether to act.

## How It Works

```
                ┌─ EarSay (standalone STT daemon) ─────────────────┐
                │  faster-whisper · VAD · HTTP API · SSE streaming │
                │  github.com/AlastorMordrek/earsay                 │
                └────────────────────────┬─────────────────────────┘
                                         │ SSE (delta mode, 30 chars / 3s timeout)
                                         ▼
Plugin loads ─→ auto-installs EarSay (uv or pipx) ─→ auto-starts server ─→ subscribes to SSE
                                                                       │
                                      ┌────────────────────────────────┘
                                      ▼
                    ContextInjector (tick every 1s)
                      ├─ text event → inject [Voice]: $delta as noReply
                      └─ 3 events + new text → trigger LLM turn
                                                                       │
                                                                       ▼
                    LLM sees [Voice]: messages in context
                    → analyzes semantically
                    → voice_cut_checkpoint(boundary) to claim
                    → acts on consumed text
```

## Prerequisites

- [OpenCode](https://opencode.ai) ≥ 1.3.13
- Working microphone

The plugin downloads and manages its own Python 3.12 and EarSay installation. No pre-installed Python required.

## Installation

### Option 1: Deploy script (recommended)

Clone, build, and run the deploy script:

```bash
git clone https://github.com/AlastorMordrek/opencode-earsay.git
cd opencode-earsay
npm install && npm run build
./deploy.sh
```

Then add the skill to `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "instructions": [
    "~/.config/opencode/skills/earsay/SKILL.md"
  ]
}
```

Restart opencode. The plugin auto-installs EarSay, starts the server, and begins listening.

### Option 2: Manual install

```bash
# 1. Clone and build
git clone https://github.com/AlastorMordrek/opencode-earsay.git
cd opencode-earsay
npm install && npm run build

# 2. Deploy plugin files
mkdir -p ~/.config/opencode/plugins/opencode-earsay-lib
cp dist/*.js dist/*.d.ts ~/.config/opencode/plugins/opencode-earsay-lib/

# 3. Create plugin entry point
cat > ~/.config/opencode/plugins/opencode-earsay.js <<'PLUGINEOF'
import { OpencodeEarsayPlugin } from "./opencode-earsay-lib/index.js"
export default OpencodeEarsayPlugin
export { OpencodeEarsayPlugin }
PLUGINEOF

# 4. Install skill (teaches the LLM about voice tools)
mkdir -p ~/.config/opencode/skills/earsay
cp skills/earsay/SKILL.md ~/.config/opencode/skills/earsay/SKILL.md

# 5. Add skill to opencode.jsonc
#    Edit ~/.config/opencode/opencode.jsonc and append to "instructions":
#    "~/.config/opencode/skills/earsay/SKILL.md"

# 6. Restart opencode
```

On restart, the plugin auto-installs EarSay (Python 3.12 + faster-whisper via uv), starts the server, and subscribes to the speech stream. No manual commands needed.

## Usage

Just speak. The plugin is live from the moment opencode starts.

The LLM sees your speech as `[Voice]:` messages in the conversation history.
When enough speech accumulates, the LLM is triggered with those messages in context.
It analyzes the text and decides whether to act or wait for more input.

**To stop listening:** say "stop listening" — the LLM calls `voice_pause`.
The microphone is released, events freeze.
**To resume:** type a resume command (the mic was paused, you can't speak to resume).

## Tools

| Tool | Purpose |
|------|---------|
| `voice_get_progressive` | Get current accumulated text + event counters |
| `voice_cut_checkpoint(N)` | Claim first N chars as a completed actionable item |
| `voice_clear_checkpoint` | Undo the last checkpoint cut |
| `voice_consume_all` | Consume all accumulated text at once |
| `voice_pause` | Pause microphone (user must type to resume) |
| `voice_resume` | Resume microphone (only when user types it) |
| `voice_start` | Start the earsay server (auto-started) |
| `voice_stop` | Stop the earsay server entirely |
| `voice_subscribe` | Reconnect SSE event stream |
| `voice_unsubscribe` | Unsubscribe from SSE event stream |
| `voice_uninstall` | Remove the plugin and optionally earsay |
| `voice_uninstall_confirm` | Confirm and execute full removal |
| `voice_status` | Server + buffer + SSE connection state |

## Configuration

Environment variables (set before starting opencode):

| Env Var | Default | Description |
|---------|---------|-------------|
| `EARSAY_PORT` | `3009` | HTTP server port |
| `EARSAY_MODEL` | `tiny.en` | Whisper model size |
| `EARSAY_CHARS_THRESHOLD` | `30` | SSE chars threshold for text events |
| `EARSAY_DISABLE_AUTO_INSTALL` | *(unset)* | Set to `"true"` to skip auto-install of earsay |
| `EARSAY_DISABLE_AUTO_START` | *(unset)* | Set to `"true"` to skip auto-start of the server |

## Crash Safety

The plugin initializes inside a top-level try-catch. No failure — install error,
server crash, missing binary, unexpected exception — can crash opencode.
The tools are always registered. If the server is down, `voice_start` retries.

## Project Structure

```
opencode-earsay/
├── src/
│   ├── index.ts              # Entry — crash-safe init, auto-install/start/SSE
│   ├── installer.ts          # EarSay auto-installer (uv → pipx → manual)
│   ├── earsay-manager.ts     # Subprocess lifecycle + HTTP API proxy
│   ├── sse-client.ts         # SSE subscription with auto-reconnect
│   ├── text-buffer.ts        # Accumulated text buffer + checkpoint management
│   ├── context-injector.ts   # Tick loop: injects [Voice] + triggers LLM
│   ├── tools.ts              # 13 voice tools
│   └── util.ts               # Node.js helpers (which, spawn, file ops, logger)
├── skills/
│   └── earsay/
│       └── SKILL.md          # Skill file — teaches LLM how voice input works
├── deploy.sh                 # One-command deployment script
├── package.json
└── README.md
```

## Development

```bash
git clone https://github.com/AlastorMordrek/opencode-earsay.git
cd opencode-earsay
npm install
npm run build     # compile TypeScript → dist/
```

## License

MIT
