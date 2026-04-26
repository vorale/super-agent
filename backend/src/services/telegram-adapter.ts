/**
 * Telegram Adapter
 *
 * Handles Telegram Bot API webhook events, message parsing, and reply posting.
 *
 * Fixed vs original:
 * - Removed parse_mode: 'Markdown' to avoid send failures on special chars
 *   (Telegram's legacy Markdown parser chokes on unescaped _, *, `, etc.)
 * - Falls back to plain text which always works
 */

import crypto from 'crypto';
import type { IMAdapter, NormalizedIMMessage } from './im.service.js';
import type { IMChannelBindingEntity } from '../repositories/im-channel.repository.js';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; username?: string; first_name?: string };
    chat: { id: number; type: string };
    text?: string;
    reply_to_message?: { message_id: number };
  };
}

export class TelegramAdapter implements IMAdapter {
  /**
   * Verify Telegram webhook via secret_token header.
   */
  verifyRequest(headers: Record<string, string>, _body: string): boolean {
    const secret = headers['x-telegram-bot-api-secret-token-internal'];
    const provided = headers['x-telegram-bot-api-secret-token'];
    if (!secret) return true;
    if (!provided) return false;

    const secretBuf = Buffer.from(secret);
    const providedBuf = Buffer.from(provided);
    if (secretBuf.length !== providedBuf.length) return false;
    return crypto.timingSafeEqual(secretBuf, providedBuf);
  }

  parseEvent(body: unknown): NormalizedIMMessage | null {
    const update = body as TelegramUpdate;
    if (!update.message?.text) return null;

    const msg = update.message;
    const hasReply = !!msg.reply_to_message;
    const threadId = hasReply
      ? String(msg.reply_to_message!.message_id)
      : String(msg.message_id);

    return {
      channelType: 'telegram',
      channelId: String(msg.chat.id),
      threadId,
      userId: String(msg.from?.id ?? 'unknown'),
      userName: msg.from?.username || msg.from?.first_name || undefined,
      text: msg.text!,
      isExplicitThread: hasReply,
    };
  }

  async sendReply(binding: IMChannelBindingEntity, _threadId: string, text: string): Promise<void> {
    const botToken = binding.bot_token_enc;
    if (!botToken) {
      console.error(`[TELEGRAM] No bot token for binding ${binding.id}`);
      return;
    }

    const chunks = this.splitMessage(text, 4096);
    for (const chunk of chunks) {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: binding.channel_id,
            text: chunk,
            // No parse_mode — plain text is safest.
            // Telegram's legacy Markdown parser fails on unescaped special chars.
            // If you need formatting, use 'MarkdownV2' with proper escaping.
          }),
        },
      );

      if (!response.ok) {
        console.error(`[TELEGRAM] API error: ${response.status} ${await response.text()}`);
      }
    }
  }

  /**
   * Register a webhook URL with Telegram Bot API.
   */
  async setWebhook(
    botToken: string,
    webhookUrl: string,
    secretToken?: string,
  ): Promise<{ ok: boolean; description?: string }> {
    const body: Record<string, unknown> = {
      url: webhookUrl,
      allowed_updates: ['message'],
    };
    if (secretToken) body.secret_token = secretToken;

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    const data = await response.json() as { ok: boolean; description?: string };
    if (!data.ok) {
      console.error(`[TELEGRAM] setWebhook failed: ${data.description}`);
    }
    return data;
  }

  async deleteWebhook(botToken: string): Promise<boolean> {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/deleteWebhook`,
      { method: 'POST' },
    );
    const data = await response.json() as { ok: boolean };
    return data.ok;
  }

  private splitMessage(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= maxLen) { chunks.push(remaining); break; }
      let splitIdx = remaining.lastIndexOf('\n', maxLen);
      if (splitIdx <= 0) splitIdx = remaining.lastIndexOf(' ', maxLen);
      if (splitIdx <= 0) splitIdx = maxLen;
      chunks.push(remaining.substring(0, splitIdx));
      remaining = remaining.substring(splitIdx).trimStart();
    }
    return chunks;
  }
}

export const telegramAdapter = new TelegramAdapter();
