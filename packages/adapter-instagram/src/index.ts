import { ValidationError } from "@chat-adapter/shared";
import { ConsoleLogger, type Logger } from "chat";
import { InstagramAdapter } from "./adapter";
import {
  DEFAULT_INSTAGRAM_API_VERSION,
  type InstagramAdapterConfig,
} from "./types";

export { InstagramAdapter } from "./adapter";
export { InstagramClient } from "./client";
export type {
  InstagramAdapterConfig,
  InstagramGraphApiError,
  InstagramGraphApiErrorResponse,
  InstagramMessageEvent,
  InstagramPageAccountResponse,
  InstagramSendMessageResponse,
  InstagramSendTextMessageParams,
  InstagramThreadId,
  InstagramWebhookAttachmentPayload,
  InstagramWebhookEntry,
  InstagramWebhookEnvelope,
  InstagramWebhookEvent,
  InstagramWebhookMessage,
  InstagramWebhookMessageAttachment,
  InstagramWebhookObject,
  InstagramWebhookPostback,
  InstagramWebhookReaction,
  InstagramWebhookRead,
  InstagramWebhookReplyReference,
  InstagramWebhookUser,
} from "./types";
export {
  DEFAULT_INSTAGRAM_API_VERSION,
  decodeInstagramThreadId,
  encodeInstagramThreadId,
} from "./types";

export function createInstagramAdapter(
  config: InstagramAdapterConfig
): InstagramAdapter;
export function createInstagramAdapter(
  config?: Partial<InstagramAdapterConfig> & { logger?: Logger }
): InstagramAdapter;
export function createInstagramAdapter(
  config: Partial<InstagramAdapterConfig> & { logger?: Logger } = {}
): InstagramAdapter {
  const logger = config.logger ?? new ConsoleLogger("info").child("instagram");

  const resolvedConfig: InstagramAdapterConfig = {
    appId:
      config.appId ?? process.env.INSTAGRAM_APP_ID ?? process.env.IG_APP_ID,
    appSecret:
      config.appSecret ??
      process.env.INSTAGRAM_APP_SECRET ??
      process.env.IG_APP_SECRET ??
      missing("appSecret", "INSTAGRAM_APP_SECRET"),
    verifyToken:
      config.verifyToken ??
      process.env.INSTAGRAM_VERIFY_TOKEN ??
      process.env.IG_VERIFY_TOKEN ??
      missing("verifyToken", "INSTAGRAM_VERIFY_TOKEN"),
    pageId:
      config.pageId ??
      process.env.INSTAGRAM_PAGE_ID ??
      process.env.FB_PAGE_ID ??
      missing("pageId", "INSTAGRAM_PAGE_ID"),
    accessToken:
      config.accessToken ??
      process.env.INSTAGRAM_ACCESS_TOKEN ??
      process.env.IG_PAGE_ACCESS_TOKEN ??
      missing("accessToken", "INSTAGRAM_ACCESS_TOKEN"),
    apiVersion:
      config.apiVersion ??
      process.env.INSTAGRAM_API_VERSION ??
      process.env.IG_API_VERSION ??
      DEFAULT_INSTAGRAM_API_VERSION,
    userName:
      config.userName ??
      process.env.INSTAGRAM_BOT_USERNAME ??
      process.env.CHAT_ADAPTER_INSTAGRAM_USERNAME ??
      "instagram-bot",
    fetch: config.fetch,
    logger,
  };

  return new InstagramAdapter(resolvedConfig);
}

function missing(fieldName: string, envName: string): never {
  throw new ValidationError(
    "instagram",
    `Instagram ${fieldName} is required. Pass it in config or set ${envName}.`
  );
}
