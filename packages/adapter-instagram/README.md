# @chat-adapter/instagram

Instagram Messaging adapter for [Chat SDK](https://chat-sdk.dev), using Meta's Instagram Messaging API for webhook-driven direct messages.

## Installation

```bash
pnpm add @chat-adapter/instagram
```

## Usage

```ts
import { Chat } from "chat";
import { createInstagramAdapter } from "@chat-adapter/instagram";

const bot = new Chat({
  userName: "mybot",
  adapters: {
    instagram: createInstagramAdapter(),
  },
});

bot.onNewMention(async (thread, message) => {
  await thread.post(`Got your Instagram DM: ${message.text}`);
});
```

When using `createInstagramAdapter()` without arguments, credentials are auto-detected from environment variables.

## Instagram setup

### 1. Create a Meta app

1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps)
2. Create a Business app and add the Instagram product
3. Connect an Instagram Business or Creator account to a Facebook Page
4. Generate a Page access token with Instagram messaging permissions

### 2. Configure webhooks

1. Set your callback URL to `https://your-domain.com/api/webhooks/instagram`
2. Set a verify token that matches `INSTAGRAM_VERIFY_TOKEN`
3. Subscribe the app to the Page and the Instagram messaging webhook field

### 3. Required credentials

- `INSTAGRAM_ACCESS_TOKEN`: Long-lived Page access token
- `INSTAGRAM_APP_SECRET`: Meta app secret used for `X-Hub-Signature-256`
- `INSTAGRAM_PAGE_ID`: Facebook Page ID linked to the Instagram account
- `INSTAGRAM_VERIFY_TOKEN`: Webhook verification secret

## Configuration

| Option | Required | Description |
|--------|----------|-------------|
| `accessToken` | No* | Page access token. Auto-detected from `INSTAGRAM_ACCESS_TOKEN` |
| `appId` | No | Meta app ID. Auto-detected from `INSTAGRAM_APP_ID` |
| `appSecret` | No* | App secret for webhook verification. Auto-detected from `INSTAGRAM_APP_SECRET` |
| `pageId` | No* | Facebook Page ID linked to the Instagram account. Auto-detected from `INSTAGRAM_PAGE_ID` |
| `verifyToken` | No* | Webhook verification token. Auto-detected from `INSTAGRAM_VERIFY_TOKEN` |
| `apiVersion` | No | Graph API version. Defaults to `v25.0` |
| `userName` | No | Bot username. Auto-detected from `INSTAGRAM_BOT_USERNAME` and defaults to `instagram-bot` |
| `logger` | No | Logger instance |

*Required at runtime — either via config or environment variable.

Legacy aliases from the standalone prototype are also supported: `IG_APP_ID`, `IG_APP_SECRET`, `IG_VERIFY_TOKEN`, `FB_PAGE_ID`, and `IG_PAGE_ACCESS_TOKEN`.

## Environment variables

```bash
INSTAGRAM_ACCESS_TOKEN=...
INSTAGRAM_APP_ID=...
INSTAGRAM_APP_SECRET=...
INSTAGRAM_PAGE_ID=...
INSTAGRAM_VERIFY_TOKEN=...
INSTAGRAM_API_VERSION=v25.0
INSTAGRAM_BOT_USERNAME=instagram-bot
```

## Features

| Feature | Supported |
|---------|-----------|
| Webhook verification | Yes |
| Signature verification | Yes |
| Receive inbound DMs | Yes |
| Send text replies | Yes |
| Attachments (inbound) | Basic metadata only |
| Attachments (outbound) | No |
| Edit message | No |
| Delete message | No |
| Reactions | Not yet |
| Typing indicators | No |

## Thread ID format

Thread IDs are encoded as base64url JSON with an `instagram:` prefix and include the Page ID plus the Instagram-scoped user ID.

## License

MIT
