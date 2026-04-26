/**
 * WhatsApp Adapter — Meta Cloud API
 *
 * Uses Meta's Graph API v21.0 for sending messages.
 * Receives messages via webhook (HTTP POST from Meta).
 *
 * Credentials in binding:
 *   - bot_token_enc: Meta access token (permanent system user token recommended)
 *   - config.phone_number_id: WhatsApp Business phone number ID
 *   - config.app_secret: Meta App Secret (for HMAC-SHA256 webhook signature verification)
 *   - config.verify_token: Webhook verification token (you choose this, Meta sends it back)
 */

import crypto from 'crypto';
import type { IMAdapter, NormalizedIMMessage } from './im.service.js';
import type { IMChannelBindingEntity } from '../repositories/im-channel.repository.js';

const GRAPH_API = 'https://graph.facebook.com/v21.0';

// ── WhatsApp Cloud API Webhook Types ──

interface WhatsAppContact {
  profile: { name: string };
  wa_id: string;
}

interface WhatsAppTextMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
}

interface WhatsAppValue {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: WhatsAppContact[];
  messages?: WhatsAppTextMessage[];
  statuses?: unknown[]; // delivery status updates — we ignore these
}

interface WhatsAppChange {
  field: string;
  value: WhatsAppValue;
}

interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppPayload {
  object: string;
  entry: WhatsAppEntry[];
}

export class WhatsAppAdapter implements IMAdapter {
  /**
   * Verify Meta webhook signature using HMAC-SHA256.
   * Meta sends X-Hub-Signature-256 header: "sha256=<hex>"
   */
  verifyRequest(headers: Record<string, string>, body: string): boolean {
    const appSecret = headers['x-whatsapp-app-secret-internal'];
    if (!appSecret) return true; // No secret configured — skip

    const signature = headers['x-hub-signature-256'];
    if (!signature) return false;

    const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(body).digest('hex');

    const expectedBuf = Buffer.from(expected);
    const signatureBuf = Buffer.from(signature);
    if (expectedBuf.length !== signatureBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, signatureBuf);
  }

  /**
   * Parse Meta Cloud API webhook payload into normalized messages.
   * Returns the first text message found, or null.
   *
   * WhatsApp payload structure:
   *   entry[].changes[].value.messages[] — actual messages
   *   entry[].changes[].value.statuses[] — delivery receipts (ignored)
   */
  parseEvent(body: unknown): NormalizedIMMessage | null {
    const payload = body as WhatsAppPayload;
    if (payload.object !== 'whatsapp_business_account') return null;
    if (!payload.entry?.length) return null;

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        const value = change.value;
        if (!value.messages?.length) continue;

        // Build contact name lookup
        const contactMap = new Map<string, string>();
        if (value.contacts) {
          for (const contact of value.contacts) {
            contactMap.set(contact.wa_id, contact.profile.name);
          }
        }

        for (const waMsg of value.messages) {
          if (waMsg.type !== 'text' || !waMsg.text?.body?.trim()) continue;

          return {
            channelType: 'whatsapp',
            // Use phone_number_id as channelId (identifies which business number received it)
            channelId: value.metadata.phone_number_id,
            // WhatsApp doesn't have threads; use sender phone as thread (1:1 conversation)
            threadId: waMsg.from,
            userId: waMsg.from,
            userName: contactMap.get(waMsg.from) || waMsg.from,
            text: waMsg.text.body.trim(),
            isExplicitThread: false, // WhatsApp has no thread concept
          };
        }
      }
    }

    return null;
  }

  /**
   * Parse ALL text messages from a webhook payload (not just the first).
   * Used by the webhook route to process batched messages.
   */
  parseAllEvents(body: unknown): NormalizedIMMessage[] {
    const payload = body as WhatsAppPayload;
    if (payload.object !== 'whatsapp_business_account') return [];
    if (!payload.entry?.length) return [];

    const messages: NormalizedIMMessage[] = [];

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        const value = change.value;
        if (!value.messages?.length) continue;

        const contactMap = new Map<string, string>();
        if (value.contacts) {
          for (const contact of value.contacts) {
            contactMap.set(contact.wa_id, contact.profile.name);
          }
        }

        for (const waMsg of value.messages) {
          if (waMsg.type !== 'text' || !waMsg.text?.body?.trim()) continue;

          messages.push({
            channelType: 'whatsapp',
            channelId: value.metadata.phone_number_id,
            threadId: waMsg.from,
            userId: waMsg.from,
            userName: contactMap.get(waMsg.from) || waMsg.from,
            text: waMsg.text.body.trim(),
            isExplicitThread: false, // WhatsApp has no thread concept
          });
        }
      }
    }

    return messages;
  }

  /**
   * Send a text reply via Meta Graph API.
   */
  async sendReply(binding: IMChannelBindingEntity, threadId: string, text: string): Promise<void> {
    const accessToken = binding.bot_token_enc;
    const cfg = binding.config as Record<string, string>;
    const phoneNumberId = cfg?.phone_number_id || binding.channel_id;

    if (!accessToken) {
      console.error(`[WHATSAPP] No access token for binding ${binding.id}`);
      return;
    }

    // threadId is the recipient's phone number (wa_id)
    const to = threadId;
    const chunks = this.splitMessage(text, 4096);

    for (const chunk of chunks) {
      const resp = await fetch(`${GRAPH_API}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: chunk },
        }),
      });

      if (!resp.ok) {
        const body = await resp.text();
        console.error(`[WHATSAPP] sendMessage failed: ${resp.status} ${resp.statusText} — ${body}`);
      }
    }
  }

  /**
   * Check if this is a webhook verification challenge (GET request).
   * Meta sends: hub.mode=subscribe, hub.challenge=<string>, hub.verify_token=<string>
   */
  static isVerificationChallenge(query: Record<string, string | undefined>): {
    isChallenge: boolean;
    challenge?: string;
    verifyToken?: string;
  } {
    if (query['hub.mode'] === 'subscribe' && query['hub.challenge']) {
      return {
        isChallenge: true,
        challenge: query['hub.challenge'],
        verifyToken: query['hub.verify_token'],
      };
    }
    return { isChallenge: false };
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

export const whatsappAdapter = new WhatsAppAdapter();
