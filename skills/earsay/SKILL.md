---
name: earsay-voice
description: >
  Voice input via earsay — continuous speech-to-text with progressive
  accumulation. When voice mode is active, analyze the growing text buffer
  each turn and semantically identify complete actionable requests.
---

# Earsay Voice Input

## Available Tools

| Tool | Purpose |
|------|---------|
| `voice_start` | Start earsay server (idempotent) |
| `voice_activate` | Subscribe to SSE stream, begin receiving text |
| `voice_get_progressive` | Get `{ text, deadEvents, charsSinceCheckpoint }` |
| `voice_cut_checkpoint(N)` | Claim first N chars of current text as actionable |
| `voice_clear_checkpoint` | Undo last cut, re-analyze |
| `voice_set_checkpoint` | Simple mode: consume all text at once |
| `voice_pause` | Pause mic + freeze all events |
| `voice_resume` | Resume (only when user types it) |
| `voice_deactivate` | End voice mode |
| `voice_stop` | Shut down earsay completely |
| `voice_status` | Server + buffer status |

## Pattern

When the user asks to start voice input or says something that sounds like speech dictation:

1. Call `voice_start` (if not already running)
2. Call `voice_activate` to begin the SSE stream
3. Tell the user they can start speaking

### Each Turn While Voice Mode is Active

Call `voice_get_progressive` → returns `{ text, deadEvents }`.

**Analyze the text semantically.** You understand natural language — use that:

- **No text yet** → continue current work, check next turn
- **Text is growing** → read it. Is there a complete actionable request?
  - If yes, WHERE does the first complete request end? Mark that character boundary mentally.
  - If more relevant detail is still arriving (specs, constraints, preferences), wait.
  - If the user moved on to other topics, the first request is complete as-is.
- **deadEvents > 0** → the user paused. Supporting signal, not a gate. A clear semantic boundary is stronger than any deadEvents count.

### Cutting (Claiming Text)

When you identify a complete request in the text:

```
voice_cut_checkpoint(boundaryCharPosition)
```

This splits the buffer:
- `consumed`: chars 0..boundary — act on this as a user prompt
- `remaining`: chars boundary..end — available next turn

### Multi-Request Handling

If the user is listing multiple tasks, each `voice_cut_checkpoint` peels one
from the front. Track them in order. If a later request is clearly more
urgent or a dependency of earlier items, reorder your mental queue.

### When to Pause

If the user asks you to stop listening or you need uninterrupted focus:
- Call `voice_pause` — freezes all events
- The user must type to resume (do NOT call `voice_resume` autonomously)
