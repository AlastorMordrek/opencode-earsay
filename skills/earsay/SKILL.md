---
name: earsay-voice
description: >
  Voice input via earsay — always-on continuous speech-to-text. The plugin
  auto-starts the server and SSE stream on load. Text accumulates in a buffer
  that the LLM analyzes each turn. The LLM decides when to ACT, not when to
  listen.
---

# Earsay Voice Input

## Automatic Behavior

On plugin load:
1. earsay is auto-installed via pip if missing (unless `EARSAY_AUTO_INSTALL=false`)
2. earsay server auto-starts on port 3009 (unless `EARSAY_AUTO_START=false`)
3. SSE subscription (fullchunk, 3s timeout) begins immediately
4. Transcribed text flows into the buffer continuously

**The LLM does NOT decide when to listen. It's always listening.**

## Available Tools

| Tool | Purpose |
|------|---------|
| `voice_get_progressive` | **PRIMARY** — get `{ text, deadEvents }`, analyze semantically |
| `voice_cut_checkpoint(N)` | Claim first N chars as a completed actionable prompt |
| `voice_clear_checkpoint` | Undo last cut, re-analyze |
| `voice_consume_all` | Consume all text at once (clean slate) |
| `voice_subscribe` | Reconnect SSE if disconnected |
| `voice_unsubscribe` | Stop buffer updates (SSE stays running) |
| `voice_pause` | Pause mic + freeze events (user must type to resume) |
| `voice_resume` | Resume mic (only when user types it) |
| `voice_start` | Start server (auto-started, use if crashed) |
| `voice_stop` | Kill server entirely |
| `voice_status` | Server + buffer state |

## Pattern

### Each Turn

Call `voice_get_progressive`. Analyze the `text` field semantically:

- **Empty text** → no speech yet, or all previous text was consumed. Continue current work.
- **Growing text** → read it. Look for complete actionable requests.
  - If you find one, identify WHERE it ends (character boundary).
  - If more relevant detail is still arriving (constraints, preferences, specs), wait.
  - If the user moved to other topics, the first request is complete as-is.
- **deadEvents > 0** → user paused. Signal, not a gate. Semantic boundaries outweigh silence.

### Cutting

```
voice_cut_checkpoint(boundaryChar)
```

This splits the buffer at your chosen boundary. Act on `consumed`. The `remaining`
stays for next turn. Each cut peels one request from the front.

### Multi-Request

Users often chain requests: "add auth then create the endpoint then add logging".
Cut one at a time, build a mental todo list, reorder by dependencies or urgency.

### Pause

User says "stop listening" → call `voice_pause` (only then). After that, the user
must TYPE to resume. Do NOT call `voice_resume` autonomously.
