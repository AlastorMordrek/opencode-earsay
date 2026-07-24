# opencode-earsay

OpenCode plugin for always-on continuous voice input via [EarSay](https://github.com/AlastorMordrek/earsay).

Install once. Restart opencode. Speak. Text flows into the buffer. The LLM analyzes it each turn, semantically identifies actionable requests, and cuts checkpoints at natural boundaries.

## How It Works

```
                ┌─ EarSay (standalone STT daemon) ─────────────────┐
                │  faster-whisper · VAD · HTTP API · SSE streaming │
                │  github.com/AlastorMordrek/earsay                 │
                └────────────────────────┬─────────────────────────┘
                                         │ SSE (fullchunk, 3s timeout)
                                         ▼
Plugin loads ─→ auto-installs EarSay (pipx) ─→ auto-starts server ─→ subscribes to SSE
                                                                       │
                                                  Each turn: LLM calls │
                                                  voice_get_progressive←┘
                                                  → analyzes text semantically
                                                  → voice_cut_checkpoint(boundary)
                                                  → acts on consumed text
```

EarSay is the dependency. This plugin wires it into OpenCode with 11 tools and automatic lifecycle management.

## Prerequisites

- [OpenCode](https://opencode.ai) ≥ 1.3.13
- Working microphone

EarSay is auto-installed via pipx on first plugin load. Python 3.10–3.12 required (3.13+ not yet supported by faster-whisper).

## Installation

Add one line to your OpenCode config:

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "plugin": ["opencode-earsay"]
}
```

Restart opencode. Done. Bun auto-installs the package, the plugin auto-installs EarSay, auto-starts the server, and subscribes to the speech stream.

## Usage

You don't need to start anything. Once opencode restarts, the plugin is live.
Just speak. The LLM sees your speech in `voice_get_progressive`.

**To stop listening:** "stop listening" → `voice_pause` (mic released, events freeze).
**To resume:** type a resume command (mic was paused, can't speak to resume).

## Tools

| Tool | Purpose |
|------|---------|
| `voice_get_progressive` | Primary — get current text + deadEvents |
| `voice_cut_checkpoint(N)` | Claim first N chars as actionable prompt |
| `voice_clear_checkpoint` | Undo last cut |
| `voice_consume_all` | Consume all text at once |
| `voice_subscribe` | Reconnect SSE (auto-connected) |
| `voice_unsubscribe` | Stop buffer updates |
| `voice_pause` | Pause mic (user must type to resume) |
| `voice_resume` | Resume mic (only when user types it) |
| `voice_start` | Start server (auto-started) |
| `voice_stop` | Kill server completely |
| `voice_status` | Server + buffer state |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `EARSAY_PORT` | `3009` | HTTP server port |
| `EARSAY_MODEL` | `tiny.en` | Whisper model |
| `EARSAY_CHARS_THRESHOLD` | `30` | SSE chars threshold |
| `EARSAY_AUTO_INSTALL` | `true` | Auto-install via pipx if missing |
| `EARSAY_AUTO_START` | `true` | Auto-start server on plugin load |
| `EARSAY_INSTALL_URL` | `git+https://...` | pipx/pip install target |

## Crash Safety

The plugin initializes inside a top-level try-catch. No failure — install error,
server crash, missing binary, unexpected exception — can crash opencode.
The tools are always registered. If the server is down, `voice_start` retries.

## Project Structure

```
opencode-earsay/
├── src/
│   ├── index.ts              # Entry — crash-safe init, auto-install/start/SSE
│   ├── earsay-manager.ts     # EarSay subprocess lifecycle + HTTP API proxy
│   ├── sse-client.ts         # SSE subscription (fullchunk mode)
│   ├── text-buffer.ts        # Fullchunk buffer, deadEvents, cutCheckpoint
│   └── tools.ts              # 11 tools, crash-safe implementations
├── package.json
└── README.md
```

## Development

```bash
git clone https://github.com/AlastorMordrek/opencode-earsay.git
cd opencode-earsay
npm install
npm run build
```

## License

MIT
