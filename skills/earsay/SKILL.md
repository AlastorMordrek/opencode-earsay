---
name: earsay-voice
description: >
  Voice input via earsay — always-on continuous speech-to-text. The plugin
  auto-starts, auto-injects growing voice text into session context on each
  SSE event, and triggers an LLM turn when new text AND 3+ events accumulate.
  The LLM analyzes the accumulated [Voice]: messages and decides whether to act.
---

# Earsay Voice Input

## Automatic Behavior

On plugin load:
1. earsay auto-installed if missing (uv → pipx → manual instructions shown)
2. earsay server auto-starts on port 3009
3. SSE subscription (delta mode, 30 chars / 3s timeout) begins immediately
4. `[Voice]:` text is injected into session context as `noReply` messages
5. On each SSE event (fired at 30 chars or 3s silence), if new text has arrived
   AND 3+ events have accumulated (text or silence), a trigger prompt is sent to
   the LLM with the `[Voice]:` context

## What the LLM Sees

On a triggered turn, the conversation history contains:

```
User [Voice]: create a new api 
User [Voice]:  endpoint for users 
User [Voice]:  with jwt auth
User:     ← trigger prompt (empty string)
```

The `[Voice]:` prefix distinguishes speech input from typed messages.
The LLM should analyze these messages semantically and decide:
- Is there a complete actionable request? → call `voice_cut_checkpoint`
- Is more context needed? → respond with "waiting for more input"
- Multiple requests chained? → cut one at a time

## Cutting

When you identify a complete request, claim it:

```
voice_cut_checkpoint(charPosition)
```

This consumes the first N chars of the accumulated text. The consumed portion
becomes your actionable prompt. Remaining text stays for the next trigger.

## Example

Turn triggered after 3 text events:

```
User [Voice]: refactor the auth module 
User [Voice]:  to use JWT tokens 
User [Voice]:  with role-based access
User:     ← trigger
```

LLM reads: "refactor the auth module to use JWT tokens with role-based access"
LLM analyzes: complete request at char 47 ("refactor the auth module to use JWT tokens")
LLM calls: `voice_cut_checkpoint(47)`
LLM acts on: "refactor the auth module to use JWT tokens"
Remaining: " with role-based access" → stays for next turn

## Pause

User says "stop listening" → call `voice_pause`. Events freeze.
User must TYPE to resume — do NOT call `voice_resume` autonomously.

## Tools

| Tool | Purpose |
|------|---------|
| `voice_get_progressive` | Get current accumulated text + counters |
| `voice_cut_checkpoint(N)` | Claim first N chars as actionable prompt |
| `voice_clear_checkpoint` | Undo last cut |
| `voice_consume_all` | Consume all text at once |
| `voice_pause` | Pause mic (user must type to resume) |
| `voice_resume` | Resume mic (only when user types it) |
| `voice_start` | Start server (auto-started on load) |
| `voice_stop` | Kill server entirely |
| `voice_subscribe` | Reconnect SSE stream |
| `voice_unsubscribe` | Stop buffer updates |
| `voice_uninstall` | Remove plugin + optionally earsay |
| `voice_uninstall_confirm` | Confirm and execute full removal |
| `voice_status` | Server + buffer + SSE state |
