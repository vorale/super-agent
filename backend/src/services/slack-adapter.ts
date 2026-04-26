/**
 * Slack Adapter
 *
 * Handles Slack Events API verification, message parsing, and reply posting.
 * Implements the IMAdapter interface for Slack-specific behavior.
 *
 * Fixed vs original:
 * - Replies now use thread_ts to respond in the correct thread
 * - Filters out non-message subtypes (channel_join, file_share, etc.)
 * - Properly handles bot_id filtering
 */

import crypto from 'crypto';
import type { IMAdapter, NormalizedIMMessage } from './im.service.js';
import type { IMChannelBindingEntity } from '../repositories/im-channel.repository.js';

/** Slack Events API event wrapper. */
interface SlackEventPayload {
  type: string;
  token?: string;
  challenge?: string;
  event?: {
    type: string;
    text?: string;
    user?: string;
    channel?: string;
    thread_ts?: string;
    ts?: string;
    bot_id?: string;
    subtype?: string;
  };
}

export class SlackAdapter implements IMAdapter {
  /**
   * Verify Slack request signature using the signing secret.
   * See: https://api.slack.com/authentication/verifying-requests-from-slack
   */
  verifyRequest(headers: Record<string, string>, body: string): boolean {
    const signingSecret = this.getSigningSecretFromHeaders(headers);
    if (!signingSecret) return true;

    const timestamp = headers['x-slack-request-timestamp'];
    const signature = headers['x-slack-signature'];
    if (!timestamp || !signature) return false;

    // Reject requests older than 5 minutes (replay protection)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

    const baseString = `v0:${timestamp}:${body}`;
    const hmac = crypto.createHmac('sha256', signingSecret).update(baseString).digest('hex');
    const expected = `v0=${hmac}`;

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  /**
   * Parse a Slack Events API payload into a normalized message.
   * Returns null for non-message events (bot messages, subtypes, etc.).
   */
  parseEvent(body: unknown): NormalizedIMMessage | null {
    const payload = body as SlackEventPayload;
    if (!payload.event || payload.event.type !== 'message') return null;

    // Filter out bot messages
    if (payload.event.bot_id) return null;

    // Filter out non-user subtypes (channel_join, file_share, message_changed, etc.)
    // Only process plain user messages (subtype is undefined for normal messages)
    if (payload.event.subtype) return null;

    if (!payload.event.text?.trim() || !payload.event.channel || !payload.event.user) {
      return null;
    }

    // Thread: use thread_ts if replying in a thread, otherwise use message ts
    const threadId = payload.event.thread_ts || payload.event.ts || String(Date.now());

    return {
      channelType: 'slack',
      channelId: payload.event.channel,
      threadId,
      userId: payload.event.user,
      text: payload.event.text.trim(),
      isExplicitThread: !!payload.event.thread_ts,
    };
  }

  /**
   * Check if payload is a Slack URL verification challenge.
   */
  static isChallenge(body: unknown): string | null {
    const p = body as SlackEventPayload;
    if (p.type === 'url_verification' && p.challenge) return p.challenge;
    return null;
  }

  /**
   * Send a reply back to Slack, using thread_ts to reply in the correct thread.
   */
  async sendReply(binding: IMChannelBindingEntity, threadId: string, text: string): Promise<void> {
    const botToken = binding.bot_token_enc;
    if (!botToken) {
      console.error(`[SLACK] No bot token for binding ${binding.id}`);
      return;
    }

    const chunks = this.splitMessage(text, 4000);
    for (const chunk of chunks) {
      const body: Record<string, unknown> = {
        channel: binding.channel_id,
        text: chunk,
      };

      // Reply in thread if we have a thread_ts
      if (threadId) {
        body.thread_ts = threadId;
      }

      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        console.error(`[SLACK] HTTP error: ${response.status} ${await response.text()}`);
        continue;
      }

      const result = await response.json() as { ok: boolean; error?: string };
      if (!result.ok) {
        console.error(`[SLACK] API error: ${result.error}`);
      }
    }
  }

  private getSigningSecretFromHeaders(headers: Record<string, string>): string | undefined {
    return headers['x-slack-signing-secret-internal'];
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

export const slackAdapter = new SlackAdapter();
