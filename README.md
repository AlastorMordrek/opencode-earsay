# opencode-earsay

OpenCode plugin for always-on continuous voice input via [earsay](https://github.com/AlastorMordrek/earsay).

Install once. Restart opencode. Speak. The plugin auto-starts, auto-installs earsay if missing,
and streams transcribed speech into a buffer the LLM analyzes each turn.

## How It Works

```
Plugin loads → auto-install earsay (if missing) → auto-start server → auto-subscribe SSE
                                                                           │
                              Each turn: LLM calls voice_get_progressive ←─┤
                              → analyzes text semantically
                              → voice_cut_checkpoint(boundary) when complete
                              → acts on consumed text, remaining stays for next turn
```

The LLM decides when to ACT based on semantic understanding. It does NOT decide when to
listen — that's always on. Only a user "stop listening" command pauses the microphone.

## Installation

Add one line to your OpenCode config:

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "plugin": ["opencode-earsay"]
}
```

Restart opencode. Done. Bun auto-installs the package.

## Usage

You don't need to start anything. Once opencode restarts, the plugin is live.
Just start speaking. The LLM will see your speech in `voice_get_progressive`.

**To stop listening:** say "stop listening" — the LLM calls `voice_pause`.
**To resume:** type a resume command.

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
| `EARSAY_AUTO_INSTALL` | `true` | pip install earsay if missing |
| `EARSAY_AUTO_START` | `true` | Auto-start server on load |

## Project Structure

```
opencode-earsay/
├── src/
│   ├── index.ts              # Plugin entry — auto-install, auto-start, auto-subscribe
│   ├── earsay-manager.ts     # Subprocess lifecycle + HTTP API proxy
│   ├── sse-client.ts         # SSE subscription (fullchunk mode)
│   ├── text-buffer.ts        # Fullchunk buffer, deadEvents, cutCheckpoint
│   └── tools.ts              # 11 tools with semantic descriptions
├── skills/
│   └── earsay/
│       └── SKILL.md          # Optional LLM guidance (bundled, documented in README)
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
