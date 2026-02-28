---
"@chat-adapter/telegram": patch
---

Add Telegram polling modes (`auto`, `webhook`, `polling`) with safe auto fallback behavior, expose `adapter.resetWebhook(...)`, and fix initialization when the chat username is missing.
