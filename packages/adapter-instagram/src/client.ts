import {
  AdapterError,
  AdapterRateLimitError,
  AuthenticationError,
  NetworkError,
  PermissionError,
  ValidationError,
} from "@chat-adapter/shared";
import {
  DEFAULT_INSTAGRAM_API_VERSION,
  type InstagramAdapterConfig,
  type InstagramPageAccountResponse,
  type InstagramSendMessageResponse,
  type InstagramSendTextMessageParams,
  isInstagramGraphApiErrorResponse,
} from "./types";

export class InstagramClient {
  readonly apiVersion: string;

  private readonly config: InstagramAdapterConfig;

  private readonly fetchImpl: typeof fetch;

  constructor(config: InstagramAdapterConfig) {
    this.config = config;
    this.apiVersion = config.apiVersion ?? DEFAULT_INSTAGRAM_API_VERSION;
    this.fetchImpl = config.fetch ?? fetch;
  }

  async sendTextMessage(
    params: InstagramSendTextMessageParams
  ): Promise<InstagramSendMessageResponse> {
    const body = new URLSearchParams();
    body.set("recipient", JSON.stringify({ id: params.recipientId }));
    body.set("messaging_type", params.messagingType ?? "RESPONSE");
    body.set("message", JSON.stringify({ text: params.text }));
    body.set("access_token", this.config.accessToken);

    return this.requestForm<InstagramSendMessageResponse>(
      `/${this.config.pageId}/messages`,
      body
    );
  }

  async getLinkedInstagramAccount(): Promise<InstagramPageAccountResponse> {
    const params = new URLSearchParams({
      fields: "instagram_business_account,connected_instagram_account",
      access_token: this.config.accessToken,
    });

    return this.requestJson<InstagramPageAccountResponse>(
      `/${this.config.pageId}?${params.toString()}`,
      { method: "GET" }
    );
  }

  private async requestForm<T>(
    path: string,
    body: URLSearchParams
  ): Promise<T> {
    return this.request<T>(this.buildUrl(path), {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
  }

  private async requestJson<T>(path: string, init: RequestInit): Promise<T> {
    return this.request<T>(this.buildUrl(path), init);
  }

  private buildUrl(path: string): string {
    return `https://graph.facebook.com/${this.apiVersion}${path}`;
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    let response: Response;

    try {
      response = await this.fetchImpl(url, init);
    } catch (error) {
      throw new NetworkError(
        "instagram",
        "Failed to reach the Instagram Graph API.",
        error instanceof Error ? error : undefined
      );
    }

    const rawBody = await response.text();

    let payload: unknown;

    if (rawBody.length > 0) {
      try {
        payload = JSON.parse(rawBody) as unknown;
      } catch {
        if (response.ok) {
          return rawBody as T;
        }

        throw new AdapterError(
          `Instagram Graph API returned a non-JSON error response with status ${response.status}.`,
          "instagram",
          `HTTP_${response.status}`
        );
      }
    }

    if (!response.ok) {
      throw this.toAdapterError(response, payload);
    }

    return payload as T;
  }

  private toAdapterError(response: Response, payload: unknown): Error {
    const message = isInstagramGraphApiErrorResponse(payload)
      ? payload.error.message
      : `Instagram Graph API request failed with status ${response.status}.`;

    if (response.status === 400) {
      return new ValidationError("instagram", message);
    }

    if (response.status === 401) {
      return new AuthenticationError("instagram", message);
    }

    if (response.status === 403) {
      return new PermissionError(
        "instagram",
        "access Instagram messaging resources",
        "instagram_manage_messages, pages_messaging, pages_manage_metadata"
      );
    }

    if (response.status === 429) {
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfter = retryAfterHeader
        ? Number.parseInt(retryAfterHeader, 10)
        : undefined;

      return new AdapterRateLimitError(
        "instagram",
        Number.isFinite(retryAfter) ? retryAfter : undefined
      );
    }

    return new AdapterError(message, "instagram", `HTTP_${response.status}`);
  }
}
