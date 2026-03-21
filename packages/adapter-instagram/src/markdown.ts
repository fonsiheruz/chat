import {
  cardToFallbackText,
  extractCard,
  ValidationError,
} from "@chat-adapter/shared";
import {
  type AdapterPostableMessage,
  type FormattedContent,
  markdownToPlainText,
  parseMarkdown,
  toPlainText,
} from "chat";

export class InstagramFormatConverter {
  parseInboundText(text: string): FormattedContent {
    return parseMarkdown(text);
  }

  renderFormatted(content: FormattedContent): string {
    return toPlainText(content).trim();
  }

  renderPostable(message: AdapterPostableMessage): string {
    const card = extractCard(message);

    if (card) {
      if (
        typeof message === "object" &&
        message !== null &&
        "fallbackText" in message &&
        typeof message.fallbackText === "string" &&
        message.fallbackText.trim().length > 0
      ) {
        return message.fallbackText;
      }

      return cardToFallbackText(card, {
        boldFormat: "**",
        lineBreak: "\n\n",
      });
    }

    if (typeof message === "string") {
      return message;
    }

    if ("raw" in message) {
      return message.raw;
    }

    if ("markdown" in message) {
      return markdownToPlainText(message.markdown);
    }

    if ("ast" in message) {
      return toPlainText(message.ast);
    }

    throw new ValidationError(
      "instagram",
      "Unsupported Instagram outbound message payload."
    );
  }
}
