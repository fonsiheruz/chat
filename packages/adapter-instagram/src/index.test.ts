import { ValidationError } from "@chat-adapter/shared";
import { describe, expect, it, vi } from "vitest";
import { InstagramAdapter } from "./adapter";
import type { InstagramMessageEvent } from "./types";

describe("InstagramAdapter", () => {
  it("maps inbound text messages into Chat SDK messages", () => {
    const adapter = createAdapter();
    const rawEvent: InstagramMessageEvent = {
      sender: {
        id: "17841400000000001",
        username: "customer-one",
      },
      recipient: {
        id: "17841400000000999",
      },
      timestamp: 1710000000000,
      message: {
        mid: "mid.1",
        text: "Hello from Instagram",
      },
    };

    const message = adapter.parseMessage(rawEvent);

    expect(message.id).toBe("mid.1");
    expect(message.threadId).toBe(
      adapter.encodeThreadId({
        pageId: "page_123",
        instagramScopedUserId: "17841400000000001",
        instagramAccountId: "17841400000000999",
      })
    );
    expect(message.text).toBe("Hello from Instagram");
    expect(message.author.userId).toBe("17841400000000001");
    expect(message.author.userName).toBe("customer-one");
    expect(message.metadata.dateSent.toISOString()).toBe(
      "2024-03-09T16:00:00.000Z"
    );
    expect(message.attachments).toEqual([]);
    expect(message.raw).toEqual(rawEvent);
  });

  it("keeps attachment metadata and creates a placeholder text fallback", () => {
    const adapter = createAdapter();
    const rawEvent: InstagramMessageEvent = {
      sender: {
        id: "17841400000000001",
      },
      recipient: {
        id: "17841400000000999",
      },
      timestamp: 1710000000000,
      message: {
        mid: "mid.attachment",
        attachments: [
          {
            type: "image",
            payload: {
              url: "https://lookaside.instagram.com/media.jpg",
              title: "photo.jpg",
            },
          },
        ],
      },
    };

    const message = adapter.parseMessage(rawEvent);

    expect(message.text).toBe("[Instagram image message]");
    expect(message.attachments).toEqual([
      {
        type: "image",
        url: "https://lookaside.instagram.com/media.jpg",
        name: "photo.jpg",
      },
    ]);
  });

  it("renders markdown to plain text before sending", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          recipient_id: "17841400000000001",
          message_id: "mid.outbound",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      )
    );
    const adapter = createAdapter(fetchMock);
    const threadId = adapter.encodeThreadId({
      pageId: "page_123",
      instagramScopedUserId: "17841400000000001",
    });

    const result = await adapter.postMessage(threadId, {
      markdown: "**Hello** from Chat SDK",
    });

    expect(result).toEqual({
      id: "mid.outbound",
      threadId,
      raw: {
        recipient_id: "17841400000000001",
        message_id: "mid.outbound",
      },
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const params = new URLSearchParams((init?.body ?? "") as string);

    expect(JSON.parse(params.get("message") ?? "{}")).toEqual({
      text: "Hello from Chat SDK",
    });
  });

  it("rejects outbound file uploads until attachment support is added", async () => {
    const adapter = createAdapter();
    const threadId = adapter.encodeThreadId({
      pageId: "page_123",
      instagramScopedUserId: "17841400000000001",
    });

    await expect(
      adapter.postMessage(threadId, {
        raw: "hello",
        files: [
          {
            data: new TextEncoder().encode("hello").buffer,
            filename: "hello.txt",
          },
        ],
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

function createAdapter(fetchImpl?: ReturnType<typeof vi.fn>): InstagramAdapter {
  return new InstagramAdapter({
    accessToken: "page-access-token",
    appSecret: "app-secret",
    fetch: (fetchImpl ??
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            recipient_id: "17841400000000001",
            message_id: "mid.default",
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          }
        )
      )) as unknown as typeof fetch,
    pageId: "page_123",
    userName: "instagram-bot",
    verifyToken: "verify-token",
  });
}
