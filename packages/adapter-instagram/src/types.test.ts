import { describe, expect, it } from "vitest";
import { InstagramAdapter } from "./adapter";
import {
  decodeInstagramThreadId,
  encodeInstagramThreadId,
  type InstagramThreadId,
} from "./types";

const THREAD_ID_ERROR_PATTERN = /thread ID/i;

describe("Instagram thread IDs", () => {
  it("round-trips encoded thread IDs", () => {
    const original: InstagramThreadId = {
      pageId: "page_123",
      instagramScopedUserId: "17841400000000001",
      instagramAccountId: "17841400000000999",
      conversationId: "dm-thread-1",
    };

    const encoded = encodeInstagramThreadId(original);

    expect(encoded.startsWith("instagram:")).toBe(true);
    expect(decodeInstagramThreadId(encoded)).toEqual(original);
  });

  it("derives a stable channel ID from the thread ID", () => {
    const adapter = new InstagramAdapter({
      accessToken: "page-access-token",
      appSecret: "app-secret",
      pageId: "page_123",
      verifyToken: "verify-token",
    });
    const threadId = adapter.encodeThreadId({
      pageId: "page_123",
      instagramScopedUserId: "17841400000000001",
    });

    expect(adapter.channelIdFromThreadId(threadId)).toBe("instagram:page_123");
  });

  it("rejects malformed thread IDs", () => {
    expect(() => decodeInstagramThreadId("instagram:not-valid")).toThrow(
      THREAD_ID_ERROR_PATTERN
    );
  });
});
