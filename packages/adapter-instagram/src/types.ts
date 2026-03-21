import { ValidationError } from "@chat-adapter/shared";
import type { Logger } from "chat";

export const DEFAULT_INSTAGRAM_API_VERSION = "v25.0";

const THREAD_ID_PREFIX = "instagram";
const THREAD_ID_VERSION = 1;

export interface InstagramThreadId {
  conversationId?: string;
  instagramAccountId?: string;
  instagramScopedUserId: string;
  pageId: string;
}

interface EncodedInstagramThreadIdV1 {
  conversationId?: string;
  instagramAccountId?: string;
  instagramScopedUserId: string;
  pageId: string;
  v: 1;
}

export interface InstagramAdapterConfig {
  accessToken: string;
  apiVersion?: string;
  appId?: string;
  appSecret: string;
  fetch?: typeof fetch;
  logger?: Logger;
  pageId: string;
  userName?: string;
  verifyToken: string;
}

export type InstagramWebhookObject = "instagram" | "page";

export interface InstagramWebhookEnvelope {
  entry: InstagramWebhookEntry[];
  object: InstagramWebhookObject;
}

export interface InstagramWebhookEntry {
  changes?: Record<string, unknown>[];
  id: string;
  messaging?: InstagramWebhookEvent[];
  time: number;
}

export interface InstagramWebhookUser {
  id: string;
  name?: string;
  username?: string;
}

export interface InstagramWebhookAttachmentPayload {
  sticker_id?: string;
  title?: string;
  url?: string;
}

export interface InstagramWebhookMessageAttachment {
  payload?: InstagramWebhookAttachmentPayload;
  type: string;
}

export interface InstagramWebhookReplyReference {
  is_self_reply?: boolean;
  mid: string;
}

export interface InstagramWebhookMessage {
  attachments?: InstagramWebhookMessageAttachment[];
  is_echo?: boolean;
  mid: string;
  quick_reply?: {
    payload: string;
  };
  reply_to?: InstagramWebhookReplyReference;
  text?: string;
}

export interface InstagramWebhookReaction {
  action?: string;
  emoji?: string;
  mid?: string;
}

export interface InstagramWebhookRead {
  seq?: number;
  watermark?: number | string;
}

export interface InstagramWebhookPostback {
  payload?: string;
  title?: string;
}

export interface InstagramWebhookEvent {
  message?: InstagramWebhookMessage;
  postback?: InstagramWebhookPostback;
  reaction?: InstagramWebhookReaction;
  read?: InstagramWebhookRead;
  recipient: InstagramWebhookUser;
  sender: InstagramWebhookUser;
  timestamp: number;
}

export interface InstagramSendTextMessageParams {
  messagingType?: "RESPONSE";
  recipientId: string;
  text: string;
}

export interface InstagramSendMessageResponse {
  message_id: string;
  recipient_id?: string;
}

export interface InstagramPageAccountResponse {
  connected_instagram_account?: {
    id: string;
  };
  id: string;
  instagram_business_account?: {
    id: string;
  };
}

export interface InstagramGraphApiError {
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
  message: string;
  type?: string;
}

export interface InstagramGraphApiErrorResponse {
  error: InstagramGraphApiError;
}

export type InstagramMessageEvent = InstagramWebhookEvent & {
  message: InstagramWebhookMessage;
};

export function encodeInstagramThreadId(threadId: InstagramThreadId): string {
  const payload: EncodedInstagramThreadIdV1 = {
    v: THREAD_ID_VERSION,
    pageId: threadId.pageId,
    instagramScopedUserId: threadId.instagramScopedUserId,
    instagramAccountId: threadId.instagramAccountId,
    conversationId: threadId.conversationId,
  };

  return `${THREAD_ID_PREFIX}:${Buffer.from(
    JSON.stringify(payload),
    "utf8"
  ).toString("base64url")}`;
}

export function decodeInstagramThreadId(threadId: string): InstagramThreadId {
  const [prefix, encoded] = threadId.split(":", 2);

  if (prefix !== THREAD_ID_PREFIX || !encoded) {
    throw new ValidationError(
      "instagram",
      `Invalid Instagram thread ID: ${threadId}`
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch (_error) {
    throw new ValidationError(
      "instagram",
      `Instagram thread ID is not valid base64url JSON: ${threadId}`
    );
  }

  if (!isRecord(parsed) || parsed.v !== THREAD_ID_VERSION) {
    throw new ValidationError(
      "instagram",
      `Unsupported Instagram thread ID version: ${threadId}`
    );
  }

  if (
    !(
      isNonEmptyString(parsed.pageId) &&
      isNonEmptyString(parsed.instagramScopedUserId)
    )
  ) {
    throw new ValidationError(
      "instagram",
      `Instagram thread ID is missing required fields: ${threadId}`
    );
  }

  return {
    pageId: parsed.pageId,
    instagramScopedUserId: parsed.instagramScopedUserId,
    instagramAccountId: asOptionalString(parsed.instagramAccountId),
    conversationId: asOptionalString(parsed.conversationId),
  };
}

export function isInstagramWebhookEnvelope(
  value: unknown
): value is InstagramWebhookEnvelope {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.object === "instagram" || value.object === "page") &&
    Array.isArray(value.entry)
  );
}

export function isInstagramWebhookEvent(
  value: unknown
): value is InstagramWebhookEvent {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isWebhookUser(value.sender) &&
    isWebhookUser(value.recipient) &&
    typeof value.timestamp === "number"
  );
}

export function isInstagramMessageEvent(
  value: unknown
): value is InstagramMessageEvent {
  if (!(isInstagramWebhookEvent(value) && isRecord(value.message))) {
    return false;
  }

  return isNonEmptyString(value.message.mid);
}

export function isInstagramGraphApiErrorResponse(
  value: unknown
): value is InstagramGraphApiErrorResponse {
  return (
    isRecord(value) &&
    isRecord(value.error) &&
    isNonEmptyString(value.error.message)
  );
}

function isWebhookUser(value: unknown): value is InstagramWebhookUser {
  return isRecord(value) && isNonEmptyString(value.id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
