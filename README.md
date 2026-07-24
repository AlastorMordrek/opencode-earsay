# opencode-earsay

OpenCode plugin for real-time voice input via [earsay](https://github.com/AlastorMordrek/earsay).

Speak into your microphone and have transcribed text progressively flow into your OpenCode agent's prompt — no typing needed.

## How It Works

```
Microphone → earsay (faster-whisper VAD) → SSE stream → plugin → agent polls text each turn
```

The plugin:
1. Manages earsay as a subprocess
2. Subscribes to earsay's real-time SSE transcript stream
3. Accumulates text until silence is detected
4. Exposes `voice_*` tools for the agent to poll and consume speech
5. A companion skill teaches the agent progressive accumulation

## Prerequisites

- OpenCode ≥ 1.3.13
- [earsay](https://github.com/AlastorMordrek/earsay) installed:
  ```bash
  pip install earsay
  ```
  Or: `pipx install git+https://github.com/AlastorMordrek/earsay.git`

- Working microphone
- Optional: `earsay warmup --download-model` for instant cold start

## Installation

Add the plugin to your OpenCode config:

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "plugin": ["opencode-earsay"]
}
```

Restart opencode — Bun auto-installs the plugin.

Load the skill so the agent knows how to use voice:

```bash
# The skill is bundled with the plugin at:
#   node_modules/opencode-earsay/skills/earsay/SKILL.md
# Copy or symlink it to your skills directory:
mkdir -p ~/.config/opencode/skills
cp node_modules/opencode-earsay/skills/earsay/SKILL.md ~/.config/opencode/skills/earsay/
```

## Usage

Once installed and earsay is running, the agent can use these tools:

| Tool | Description |
|------|-------------|
| `voice_start` | Start the earsay server |
| `voice_stop` | Stop the server |
| `voice_activate` | Begin streaming speech into buffer |
| `voice_deactivate` | Stop streaming |
| `voice_get_progressive` | Get text + silence status |
| `voice_get_new` | Get text since last checkpoint |
| `voice_set_checkpoint` | Mark text as consumed |
| `voice_pause` / `voice_resume` | Mic control |
| `voice_status` | Server status |

### Quick Start

1. In opencode, ask the agent:
   > "Activate voice input, I want to speak my commands"
2. The agent calls `voice_start` then `voice_activate`
3. Speak your command naturally
4. When you pause, the agent accumulates the text and acts on it

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `EARSAY_PORT` | `3009` | HTTP server port |
| `EARSAY_MODEL` | `tiny.en` | Whisper model |
| `EARSAY_CHARS_THRESHOLD` | `30` | SSE chars before event |
| `EARSAY_SILENCE_TIMEOUT` | `2000` | ms silence = utterance end |
| `EARSAY_AUTO_START` | `true` | Auto-start on plugin load |

## Project Structure

```
opencode-earsay/
├── src/
│   ├── index.ts              # Plugin entry
│   ├── earsay-manager.ts     # Subprocess lifecycle
│   ├── sse-client.ts         # SSE subscription
│   ├── text-buffer.ts        # Checkpoint-aware buffer
│   └── tools.ts              # Voice tool definitions
├── skills/
│   └── earsay/
│       └── SKILL.md          # Agent skill
├── package.json
└── README.md
```

## Development

```bash
git clone https://github.com/AlastorMordrek/opencode-earsay.git
cd opencode-earsay
bun install
bun run build    # compile TypeScript
bun run dev      # watch mode
```

## Related Projects

- [earsay](https://github.com/AlastorMordrek/earsay) — Continuous STT daemon (dependency)
- [earsay-mcp](https://github.com/AlastorMordrek/earsay-mcp) — MCP bridge for non-OpenCode clients

## License

MIT
