---
name: earsay-voice
description: >
  Voice input via earsay — continuous speech-to-text with progressive
  accumulation. When voice mode is active, check for new spoken text
  each turn and accumulate until silence before acting on it.
---

# Earsay Voice Input

Use the `voice_*` tools to interact with the earsay speech-to-text server.

The server runs locally and transcribes microphone audio using
faster-whisper. The plugin manages the server process and streams
transcribed text in real time.

## Available Tools

| Tool | Purpose |
|------|---------|
| `voice_start` | Start the earsay transcription server |
| `voice_stop` | Stop the server |
| `voice_pause` | Pause microphone (server stays up) |
| `voice_resume` | Resume microphone |
| `voice_activate` | Activate voice mode — begins streaming speech |
| `voice_deactivate` | Deactivate voice mode |
| `voice_get_new` | Get text since last checkpoint |
| `voice_get_progressive` | Get new text + silence detection status |
| `voice_set_checkpoint` | Mark consumed text as read |
| `voice_status` | Server + buffer status |

## When to Use

Use voice input when the user:
- Is describing a complex task they find easier to speak than type
- Asks to "talk" or says "voice mode"
- Is actively pair-programming with you verbally
- Says a wake phrase like "hey opencode" or "listen"

## Activation Pattern

When the user wants to speak a command:

1. Call `voice_start` if not already running
2. Call `voice_activate` — this subscribes to the real-time speech stream
3. Tell the user they can start speaking

## Progressive Accumulation (Core Pattern)

Each turn while voice mode is active, call `voice_get_progressive`:

```
voice_get_progressive returns:
  { text: "...", silent: true/false, charsSinceCheckpoint: N }
```

### Decision Matrix

| text | silent | charsSinceCheckpoint | Action |
|------|--------|---------------------|--------|
| empty | — | 0 | No speech yet. Continue current work. |
| non-empty | **false** | growing | User is still speaking. Do NOT act yet. |
| non-empty | **true** | N > 0 | User finished speaking. **Treat text as user prompt.** |
| non-empty | **true** | N ≈ previous | Already processed. No new speech. |

### Example Flow

```
Turn 1: voice_get_progressive → { text: "create a new", silent: false, chars: 12 }
  → "User is still speaking, wait..."

Turn 2: voice_get_progressive → { text: "create a new api endpoint for", silent: false, chars: 35 }
  → "Still speaking, accumulating..."

Turn 3: voice_get_progressive → { text: "create a new api endpoint for users", silent: true, chars: 48 }
  → "Speech complete! Acting on: create a new api endpoint for users"
  → Call voice_set_checkpoint to mark consumed
  → Proceed as if user typed that prompt
```

## After Processing

1. Execute the user's spoken request
2. Call `voice_set_checkpoint` — this marks the consumed text as read
3. Next `voice_get_progressive` call will return `{ text: "" }`

## Deactivation

When voice mode is no longer needed:
- Call `voice_deactivate` to unsubscribe from speech stream
- Optionally `voice_pause` to release the microphone
- Optionally `voice_stop` to shut down the server

## Error Recovery

- **"earsay binary not found"**: User needs `pip install earsay`
- **Server not responding**: Call `voice_start` to restart
- **Empty transcription**: May mean no speech detected or mic issue
- **SSE disconnected**: Call `voice_activate` to reconnect
