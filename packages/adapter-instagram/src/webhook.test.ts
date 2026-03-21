import { createHmac } from "node:crypto";
import type { ChatInstance, Logger } from "chat";
import { describe, expect, it, vi } from "vitest";
import { InstagramAdapter } from "./adapter";
import type { InstagramWebhookEnvelope } from "./types";

describe("Instagram webhook handling", () => {
  it("returns the verification challenge for GET requests", async () => {
    const adapter = createAdapter();
    const request = new Request(
      "https://example.com/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=12345"
    );

    const response = await adapter.handleWebhook(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("12345");
  });

  it("rejects POST requests with an invalid signature", async () => {
    const { chat, processMessage } = createChatStub();
    const adapter = createAdapter();
    await adapter.initialize(chat);

    const body = JSON.stringify(createTextEnvelope());
    const request = new Request("https://example.com/api/webhooks/instagram", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": "sha256=bad-signature",
      },
      body,
    });

    const response = await adapter.handleWebhook(request);

    expect(response.status).toBe(401);
    expect(processMessage).not.toHaveBeenCalled();
  });

  it("routes signed text webhooks into ChatInstance.processMessage", async () => {
    const { chat, processMessage } = createChatStub();
    const adapter = createAdapter();
    await adapter.initialize(chat);

    const payload = createTextEnvelope();
    const body = JSON.stringify(payload);
    const signature = createHmac("sha256", "app-secret")
      .update(body, "utf8")
      .digest("hex");
    const request = new Request("https://example.com/api/webhooks/instagram", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": `sha256=${signature}`,
      },
      body,
    });

    const response = await adapter.handleWebhook(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("EVENT_RECEIVED");
    expect(processMessage).toHaveBeenCalledTimes(1);

    const [calledAdapter, threadId, messageFactory] =
      processMessage.mock.calls[0] ?? [];

    expect(calledAdapter).toBe(adapter);
    expect(threadId).toBe(
      adapter.encodeThreadId({
        pageId: "page_123",
        instagramScopedUserId: "17841400000000001",
        instagramAccountId: "17841400000000999",
      })
    );
    expect(typeof messageFactory).toBe("function");

    const parsedMessage = await (
      messageFactory as () => Promise<{ text: string; id: string }>
    )();

    expect(parsedMessage.id).toBe("mid.webhook");
    expect(parsedMessage.text).toBe("Hello from a signed webhook");
  });

  it("ignores unsupported reaction webhook events for now", async () => {
    const { chat, processMessage } = createChatStub();
    const adapter = createAdapter();
    await adapter.initialize(chat);

    const payload: InstagramWebhookEnvelope = {
      object: "page",
      entry: [
        {
          id: "page_123",
          time: 1710000000000,
          messaging: [
            {
              sender: { id: "17841400000000001" },
              recipient: { id: "17841400000000999" },
              timestamp: 1710000000000,
              reaction: {
                action: "react",
                emoji: "👍",
                mid: "mid.webhook",
              },
            },
          ],
        },
      ],
    };
    const body = JSON.stringify(payload);
    const signature = createHmac("sha256", "app-secret")
      .update(body, "utf8")
      .digest("hex");
    const request = new Request("https://example.com/api/webhooks/instagram", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": `sha256=${signature}`,
      },
      body,
    });

    const response = await adapter.handleWebhook(request);

    expect(response.status).toBe(200);
    expect(processMessage).not.toHaveBeenCalled();
  });
});

function createAdapter(): InstagramAdapter {
  return new InstagramAdapter({
    accessToken: "page-access-token",
    appSecret: "app-secret",
    pageId: "page_123",
    userName: "instagram-bot",
    verifyToken: "verify-token",
  });
}

function createTextEnvelope(): InstagramWebhookEnvelope {
  return {
    object: "page",
    entry: [
      {
        id: "page_123",
        time: 1710000000000,
        messaging: [
          {
            sender: {
              id: "17841400000000001",
              username: "customer-one",
            },
            recipient: {
              id: "17841400000000999",
            },
            timestamp: 1710000000000,
            message: {
              mid: "mid.webhook",
              text: "Hello from a signed webhook",
            },
          },
        ],
      },
    ],
  };
}

function createChatStub(): {
  chat: ChatInstance;
  logger: Logger;
  processMessage: ReturnType<typeof vi.fn>;
} {
  const logger = createLoggerStub();
  const processMessage = vi.fn();
  const chat = {
    getLogger: vi.fn(() => logger),
    getState: vi.fn(),
    getUserName: vi.fn(() => "instagram-bot"),
    handleIncomingMessage: vi.fn(),
    processAction: vi.fn(),
    processAppHomeOpened: vi.fn(),
    processAssistantContextChanged: vi.fn(),
    processAssistantThreadStarted: vi.fn(),
    processMemberJoinedChannel: vi.fn(),
    processMessage,
    processModalClose: vi.fn(),
    processModalSubmit: vi.fn(),
    processReaction: vi.fn(),
    processSlashCommand: vi.fn(),
  } as unknown as ChatInstance;

  return { chat, logger, processMessage };
}

function createLoggerStub(): Logger {
  const logger = {
    child: () => logger,
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  } as Logger;

  return logger;
}
