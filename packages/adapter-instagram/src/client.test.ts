import { describe, expect, it, vi } from "vitest";
import { InstagramClient } from "./client";

describe("InstagramClient", () => {
  it("posts text replies to the Graph API messages endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          recipient_id: "17841400000000001",
          message_id: "mid.123",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      )
    );
    const client = new InstagramClient({
      accessToken: "page-access-token",
      appSecret: "app-secret",
      fetch: fetchMock as unknown as typeof fetch,
      pageId: "page_123",
      verifyToken: "verify-token",
    });

    const response = await client.sendTextMessage({
      recipientId: "17841400000000001",
      text: "hello, world",
    });

    expect(response).toEqual({
      recipient_id: "17841400000000001",
      message_id: "mid.123",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const params = new URLSearchParams((init?.body ?? "") as string);

    expect(url).toBe("https://graph.facebook.com/v25.0/page_123/messages");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      "content-type": "application/x-www-form-urlencoded",
    });
    expect(JSON.parse(params.get("recipient") ?? "{}")).toEqual({
      id: "17841400000000001",
    });
    expect(params.get("messaging_type")).toBe("RESPONSE");
    expect(JSON.parse(params.get("message") ?? "{}")).toEqual({
      text: "hello, world",
    });
    expect(params.get("access_token")).toBe("page-access-token");
  });

  it("queries the linked Instagram account fields from the Page node", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "page_123",
          instagram_business_account: { id: "17841400000000999" },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      )
    );
    const client = new InstagramClient({
      accessToken: "page-access-token",
      appSecret: "app-secret",
      fetch: fetchMock as unknown as typeof fetch,
      pageId: "page_123",
      verifyToken: "verify-token",
    });

    const account = await client.getLinkedInstagramAccount();

    expect(account.instagram_business_account?.id).toBe("17841400000000999");

    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(url).toContain(
      "/page_123?fields=instagram_business_account%2Cconnected_instagram_account"
    );
  });
});
