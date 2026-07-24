# opencode-earsay

OpenCode plugin for real-time voice input via [earsay](https://github.com/AlastorMordrek/earsay).

Speak into your microphone. The LLM analyzes the growing text stream, semantically identifies actionable requests, and acts on them — all while you keep talking.

## How It Works

```
Microphone → earsay (faster-whisper VAD) → SSE stream (fullchunk) → Plugin TextBuffer
                                                                           │
                                            LLM calls voice_get_progressive │
                                            each turn, analyzes text,       │
                                            cuts checkpoints semantically   │
                                                                           ▼
                                                                Actionable items
                                                                become user prompts
```

The plugin:
- Manages earsay as a subprocess
- Subscribes to earsay's SSE stream with `fullchunk=true` (each event carries the full accumulated text)
- Exposes `voice_*` tools for the LLM
- Tracks `deadEvents` (consecutive empty events ≈ silence) as a supporting signal

The LLM drives the semantic boundary detection — tool descriptions teach the pattern.

## Prerequisites

- OpenCode ≥ 1.3.13
- [earsay](https://github.com/AlastorMordrek/earsay) installed:
  ```bash
  pip install earsay
  ```

- Working microphone

## Installation

Add the plugin to your OpenCode config:

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "plugin": ["opencode-earsay"]
}
```

Restart opencode — Bun auto-installs. That's it.

### Optional: Load the Companion Skill

For more nuanced voice behavior guidance, copy the skill:

```bash
cp node_modules/opencode-earsay/skills/earsay/SKILL.md \
  ~/.config/opencode/skills/earsay/SKILL.md
```

Then add to your config's `"instructions"` array (ask the LLM to do this).

## Usage

Tools available to the LLM:

| Tool | Purpose |
|------|---------|
| `voice_start` | Start earsay server (idempotent) |
| `voice_stop` | Stop server entirely |
| `voice_activate` | Subscribe to SSE stream, begin text accumulation |
| `voice_deactivate` | End voice mode |
| `voice_get_progressive` | Get `{ text, deadEvents, charsSinceCheckpoint }` |
| `voice_cut_checkpoint(N)` | Claim first N chars as a completed actionable prompt |
| `voice_clear_checkpoint` | Undo last cut, re-analyze |
| `voice_set_checkpoint` | Simple: consume all text at once |
| `voice_pause` / `voice_resume` | Mic control |
| `voice_status` | Server + buffer status |

Say: "Start listening" — the LLM handles the rest.

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `EARSAY_PORT` | `3009` | HTTP server port |
| `EARSAY_MODEL` | `tiny.en` | Whisper model |
| `EARSAY_CHARS_THRESHOLD` | `30` | SSE chars before event |
| `EARSAY_SILENCE_TIMEOUT` | `2000` | ms silence before timeout event |

## Project Structure

```
opencode-earsay/
├── src/
│   ├── index.ts              # Plugin entry
│   ├── earsay-manager.ts     # Subprocess lifecycle + HTTP API
│   ├── sse-client.ts         # SSE subscription
│   ├── text-buffer.ts        # Fullchunk buffer + deadEvents + cutCheckpoint
│   └── tools.ts              # 11 voice tool definitions
├── skills/
│   └── earsay/
│       └── SKILL.md          # Optional LLM guidance
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

## Related Projects

- [earsay](https://github.com/AlastorMordrek/earsay) — Continuous STT daemon
- [earsay-mcp](https://github.com/AlastorMordrek/earsay-mcp) — MCP bridge for non-OpenCode clients

## License

MIT
