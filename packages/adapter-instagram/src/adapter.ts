import { createHmac, timingSafeEqual } from "node:crypto";
import { extractFiles, ValidationError } from "@chat-adapter/shared";
import {
  type Adapter,
  type AdapterPostableMessage,
  type Attachment,
  type ChatInstance,
  type FetchOptions,
  type FetchResult,
  type FormattedContent,
  type Logger,
  Message,
  NotImplementedError,
  type RawMessage,
  type ThreadInfo,
  type WebhookOptions,
} from "chat";
import { InstagramClient } from "./client";
import { InstagramFormatConverter } from "./markdown";
import {
  decodeInstagramThreadId,
  encodeInstagramThreadId,
  type InstagramAdapterConfig,
  type InstagramMessageEvent,
  type InstagramThreadId,
  type InstagramWebhookEntry,
  type InstagramWebhookEvent,
  type InstagramWebhookMessageAttachment,
  isInstagramMessageEvent,
  isInstagramWebhookEnvelope,
} from "./types";

export class InstagramAdapter implements Adapter<InstagramThreadId, unknown> {
  readonly name = "instagram";

  readonly persistMessageHistory = false;

  readonly userName: string;

  private chat: ChatInstance | null = null;

  private readonly client: InstagramClient;

  private readonly config: InstagramAdapterConfig;

  private readonly converter = new InstagramFormatConverter();

  private logger: Logger;

  constructor(config: InstagramAdapterConfig) {
    this.config = config;
    this.userName = config.userName ?? "instagram-bot";
    this.client = new InstagramClient(config);
    this.logger = config.logger ?? chatLoggerFallback();
  }

  async initialize(chat: ChatInstance): Promise<void> {
    this.chat = chat;
    this.logger = this.config.logger ?? chat.getLogger("adapter:instagram");
    this.logger.info("Instagram adapter initialized", {
      apiVersion: this.client.apiVersion,
      pageId: this.config.pageId,
    });
  }

  async disconnect(): Promise<void> {
    this.chat = null;
  }

  channelIdFromThreadId(threadId: string): string {
    const { pageId } = this.decodeThreadId(threadId);
    return `instagram:${pageId}`;
  }

  encodeThreadId(platformData: InstagramThreadId): string {
    return encodeInstagramThreadId(platformData);
  }

  decodeThreadId(threadId: string): InstagramThreadId {
    return decodeInstagramThreadId(threadId);
  }

  isDM(): boolean {
    return true;
  }

  async openDM(userId: string): Promise<string> {
    return this.encodeThreadId({
      pageId: this.config.pageId,
      instagramScopedUserId: userId,
    });
  }

  renderFormatted(content: FormattedContent): string {
    return this.converter.renderFormatted(content);
  }

  parseMessage(raw: unknown): Message<unknown> {
    if (!isInstagramMessageEvent(raw)) {
      throw new ValidationError(
        "instagram",
        "Instagram webhook event does not contain a supported message payload."
      );
    }

    const threadId = this.encodeThreadId({
      pageId: this.config.pageId,
      instagramScopedUserId: this.getConversationParticipantId(raw),
      instagramAccountId: this.getInstagramAccountId(raw),
    });
    const text = this.getMessageText(raw);
    const isEcho = raw.message.is_echo === true;
    const senderName = raw.sender.name ?? raw.sender.username ?? raw.sender.id;

    return new Message({
      id: raw.message.mid,
      threadId,
      text,
      formatted: this.converter.parseInboundText(text),
      raw,
      author: {
        userId: raw.sender.id,
        userName: raw.sender.username ?? raw.sender.id,
        fullName: senderName,
        isBot: isEcho,
        isMe: isEcho,
      },
      metadata: {
        dateSent: new Date(raw.timestamp),
        edited: false,
      },
      attachments: this.toChatAttachments(raw.message.attachments),
    });
  }

  async postMessage(
    threadId: string,
    message: AdapterPostableMessage
  ): Promise<RawMessage<unknown>> {
    const { instagramScopedUserId } = this.decodeThreadId(threadId);
    const files = extractFiles(message);

    if (files.length > 0 || this.hasInlineAttachments(message)) {
      throw new ValidationError(
        "instagram",
        "The Instagram adapter currently supports text-only outbound messages."
      );
    }

    const text = this.converter.renderPostable(message).trim();

    if (!text) {
      throw new ValidationError(
        "instagram",
        "Instagram direct messages cannot be empty."
      );
    }

    const response = await this.client.sendTextMessage({
      recipientId: instagramScopedUserId,
      text,
    });

    return {
      id: response.message_id,
      threadId,
      raw: response,
    };
  }

  async editMessage(): Promise<RawMessage<unknown>> {
    throw new ValidationError(
      "instagram",
      "Editing Instagram direct messages is not supported."
    );
  }

  async deleteMessage(): Promise<void> {
    throw new ValidationError(
      "instagram",
      "Deleting Instagram direct messages is not supported."
    );
  }

  async addReaction(): Promise<void> {
    throw new NotImplementedError(
      "Instagram message reactions are not supported by this adapter yet.",
      "reactions"
    );
  }

  async removeReaction(): Promise<void> {
    throw new NotImplementedError(
      "Instagram message reactions are not supported by this adapter yet.",
      "reactions"
    );
  }

  async fetchMessages(
    threadId: string,
    _options?: FetchOptions
  ): Promise<FetchResult<unknown>> {
    this.logger.debug(
      "fetchMessages is not implemented for Instagram yet; returning an empty page.",
      { threadId }
    );

    return { messages: [] };
  }

  async fetchThread(threadId: string): Promise<ThreadInfo> {
    const decoded = this.decodeThreadId(threadId);

    return {
      id: threadId,
      channelId: this.channelIdFromThreadId(threadId),
      isDM: true,
      metadata: {
        pageId: decoded.pageId,
        instagramScopedUserId: decoded.instagramScopedUserId,
        instagramAccountId: decoded.instagramAccountId,
        conversationId: decoded.conversationId,
      },
    };
  }

  async startTyping(threadId: string, status?: string): Promise<void> {
    this.logger.debug(
      "Typing indicators are not supported by the Instagram adapter.",
      { threadId, status }
    );
  }

  async handleWebhook(
    request: Request,
    options?: WebhookOptions
  ): Promise<Response> {
    if (request.method === "GET") {
      return this.handleVerificationRequest(request);
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const rawBody = await request.text();

    if (!this.isValidSignature(request, rawBody)) {
      this.logger.warn("Rejected Instagram webhook with invalid signature");
      return new Response("Invalid signature", { status: 401 });
    }

    let payload: unknown;

    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    if (!isInstagramWebhookEnvelope(payload)) {
      return new Response("Unsupported webhook payload", { status: 400 });
    }

    if (!this.chat) {
      return new Response("Instagram adapter has not been initialized", {
        status: 503,
      });
    }

    for (const entry of payload.entry) {
      this.processEntry(entry, options);
    }

    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  private processEntry(
    entry: InstagramWebhookEntry,
    options?: WebhookOptions
  ): void {
    for (const event of entry.messaging ?? []) {
      if (!isInstagramMessageEvent(event)) {
        this.logUnsupportedEvent(event);
        continue;
      }

      if (event.message.is_echo) {
        this.logger.debug("Skipping Instagram echo message", {
          messageId: event.message.mid,
        });
        continue;
      }

      const threadId = this.encodeThreadId({
        pageId: this.config.pageId,
        instagramScopedUserId: this.getConversationParticipantId(event),
        instagramAccountId: this.getInstagramAccountId(event),
      });

      this.chat?.processMessage(
        this,
        threadId,
        () => Promise.resolve(this.parseMessage(event)),
        options
      );
    }
  }

  private handleVerificationRequest(request: Request): Response {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const verifyToken = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode !== "subscribe" || !challenge) {
      return new Response("Invalid verification request", { status: 400 });
    }

    if (verifyToken !== this.config.verifyToken) {
      return new Response("Verification token mismatch", { status: 403 });
    }

    return new Response(challenge, { status: 200 });
  }

  private isValidSignature(request: Request, rawBody: string): boolean {
    const signatureHeader = request.headers.get("x-hub-signature-256");

    if (!signatureHeader) {
      return false;
    }

    const [prefix, signature] = signatureHeader.split("=", 2);

    if (prefix !== "sha256" || !signature) {
      return false;
    }

    const expectedSignature = createHmac("sha256", this.config.appSecret)
      .update(rawBody, "utf8")
      .digest("hex");

    const actualBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    if (actualBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(actualBuffer, expectedBuffer);
  }

  private getConversationParticipantId(event: InstagramMessageEvent): string {
    return event.message.is_echo ? event.recipient.id : event.sender.id;
  }

  private getInstagramAccountId(event: InstagramMessageEvent): string {
    return event.message.is_echo ? event.sender.id : event.recipient.id;
  }

  private getMessageText(event: InstagramMessageEvent): string {
    if (
      typeof event.message.text === "string" &&
      event.message.text.length > 0
    ) {
      return event.message.text;
    }

    const attachments = event.message.attachments ?? [];

    if (attachments.length === 0) {
      return "[Unsupported Instagram message]";
    }

    if (attachments.length === 1) {
      return `[Instagram ${attachments[0]?.type ?? "attachment"} message]`;
    }

    return `[Instagram attachment message (${attachments.length} items)]`;
  }

  private toChatAttachments(
    attachments?: InstagramWebhookMessageAttachment[]
  ): Attachment[] {
    return (attachments ?? []).map((attachment) => ({
      type: this.mapAttachmentType(attachment.type),
      url: attachment.payload?.url,
      name: attachment.payload?.title,
    }));
  }

  private mapAttachmentType(type: string): Attachment["type"] {
    switch (type) {
      case "image":
        return "image";
      case "video":
        return "video";
      case "audio":
        return "audio";
      default:
        return "file";
    }
  }

  private hasInlineAttachments(message: AdapterPostableMessage): boolean {
    return (
      typeof message === "object" &&
      message !== null &&
      "attachments" in message &&
      Array.isArray(message.attachments) &&
      message.attachments.length > 0
    );
  }

  private logUnsupportedEvent(event: InstagramWebhookEvent): void {
    let kind = "unknown";

    if (event.reaction) {
      kind = "reaction";
    } else if (event.postback) {
      kind = "postback";
    } else if (event.read) {
      kind = "read";
    }

    this.logger.debug("Ignoring unsupported Instagram webhook event", {
      kind,
      timestamp: event.timestamp,
    });
  }
}

function chatLoggerFallback(): Logger {
  return {
    child: () => chatLoggerFallback(),
    debug: () => {},
    error: () => {},
    info: () => {},
    warn: () => {},
  };
}
