/**
 * DingTalk Adapter — Stream Mode (WebSocket)
 *
 * Uses dingtalk-stream SDK to receive messages via long-lived WebSocket,
 * and DingTalk v1.0 REST API for sending replies.
 *
 * This replaces the old Outgoing Webhook approach which was limited to
 * group @mentions and could only reply via webhook URL.
 *
 * Credentials needed in binding config:
 *   - bot_token_enc: clientSecret (app secret)
 *   - config.client_id: clientId (app key / robotCode)
 */

import crypto from 'crypto';
import type { IMAdapter, NormalizedIMMessage } from './im.service.js';
import type { IMChannelBindingEntity } from '../repositories/im-channel.repository.js';
import { imQueueService } from './im-queue.service.js';

const DINGTALK_API = 'https://api.dingtalk.com';
const DINGTALK_WEBHOOK_PREFIX = 'https://oapi.dingtalk.com/';

// ── Token Cache ──

interface CachedToken { token: string; expiresAt: number; }
const tokenCache = new Map<string, CachedToken>();
const TOKEN_SAFETY_MARGIN_MS = 5 * 60 * 1000;

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const cached = tokenCache.get(clientId);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const resp = await fetch(`${DINGTALK_API}/v1.0/oauth2/accessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appKey: clientId, appSecret: clientSecret }),
  });
  if (!resp.ok) {
    throw new Error(`DingTalk getAccessToken failed: ${resp.status} ${await resp.text()}`);
  }
  const data = await resp.json() as { accessToken?: string; expireIn?: number };
  if (!data.accessToken) throw new Error('DingTalk: no accessToken in response');

  const expireSec = data.expireIn ?? 7200;
  tokenCache.set(clientId, {
    token: data.accessToken,
    expiresAt: Date.now() + expireSec * 1000 - TOKEN_SAFETY_MARGIN_MS,
  });
  return data.accessToken;
}

// ── Active Stream connections ──

interface DingTalkConnection {
  binding: IMChannelBindingEntity;
  client: unknown; // DWClient instance
}
const activeConnections = new Map<string, DingTalkConnection>();

// ── DingTalk Message Payload ──

interface DingTalkStreamMessage {
  conversationId: string;
  msgId: string;
  senderStaffId: string;
  senderNick: string;
  conversationType: '1' | '2'; // 1=private, 2=group
  text?: { content: string };
  msgtype: string;
  isInAtList?: boolean;
  atUsers?: Array<{ dingtalkId: string }>;
  sessionWebhook?: string;
  robotCode?: string;
  createAt?: number;
}

export class DingTalkAdapter implements IMAdapter {
  // ── Legacy webhook verification (kept for backward compat) ──

  verifyRequest(headers: Record<string, string>, _body: string): boolean {
    const secret = headers['x-dingtalk-secret-internal'];
    if (!secret) return true;
    const timestamp = headers['timestamp'];
    const sign = headers['sign'];
    if (!timestamp || !sign) return false;
    const stringToSign = `${timestamp}\n${secret}`;
    const hmac = crypto.createHmac('sha256', secret).update(stringToSign).digest('base64');
    return hmac === sign;
  }

  parseEvent(body: unknown): NormalizedIMMessage | null {
    // Stream mode handles messages via WebSocket callback, not HTTP.
    // This is kept for legacy webhook fallback only.
    const payload = body as DingTalkStreamMessage;
    if (payload.msgtype !== 'text' || !payload.text?.content) return null;
    if (!payload.conversationId) return null;
    return {
      channelType: 'dingtalk',
      channelId: payload.conversationId,
      threadId: payload.msgId || `dingtalk-${Date.now()}`,
      userId: payload.senderStaffId || 'unknown',
      userName: payload.senderNick,
      text: payload.text.content.trim(),
      isExplicitThread: false, // DingTalk has no thread/topic concept
    };
  }

  // ── Stream Gateway lifecycle ──

  async startGateway(): Promise<void> {
    const bindings = await this.discoverBindings();
    if (bindings.length === 0) {
      console.log('[DINGTALK] No enabled DingTalk bindings found, gateway idle');
      return;
    }
    for (const binding of bindings) {
      try {
        await this.connectBot(binding);
      } catch (err) {
        console.error(`[DINGTALK] Failed to connect binding ${binding.id}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  async stopGateway(): Promise<void> {
    for (const [bindingId] of activeConnections) {
      console.log(`[DINGTALK] Disconnected binding ${bindingId}`);
    }
    activeConnections.clear();
  }

  async addBot(binding: IMChannelBindingEntity): Promise<void> {
    if (activeConnections.has(binding.id)) return;
    await this.connectBot(binding);
  }

  removeBot(bindingId: string): void {
    activeConnections.delete(bindingId);
  }

  // ── Send reply via REST API (with sessionWebhook fast-path) ──

  async sendReply(
    binding: IMChannelBindingEntity,
    _threadId: string,
    text: string,
    replyContext?: Record<string, unknown>,
  ): Promise<void> {
    const cfg = binding.config as Record<string, string>;
    const clientId = cfg?.client_id;
    const clientSecret = binding.bot_token_enc;

    // Priority 1: sessionWebhook from Stream mode (fastest, no token needed)
    const sessionWebhook = replyContext?.dingtalkSessionWebhook as string | undefined;
    if (sessionWebhook?.startsWith(DINGTALK_WEBHOOK_PREFIX)) {
      try {
        await this.sendViaSessionWebhook(sessionWebhook, text);
        return;
      } catch (err) {
        console.warn(`[DINGTALK] sessionWebhook failed, trying next method:`, err instanceof Error ? err.message : err);
      }
    }

    // Priority 2: binding.webhook_url (Outgoing Webhook mode — the oapi.dingtalk.com/robot/send URL)
    const bindingWebhook = binding.webhook_url || cfg?.webhook_url;
    if (bindingWebhook) {
      const chunks = this.splitMessage(text, 20000);
      for (const chunk of chunks) {
        const resp = await fetch(bindingWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ msgtype: 'markdown', markdown: { title: 'Reply', text: chunk } }),
        });
        if (!resp.ok) {
          console.error(`[DINGTALK] webhook_url reply error: ${resp.status} ${await resp.text()}`);
        }
      }
      return;
    }

    // Priority 3: REST API with access token (Stream mode fallback)
    if (!clientId || !clientSecret) {
      console.error(`[DINGTALK] No reply method available for binding ${binding.id} (no sessionWebhook, no webhook_url, no client_id)`);
      return;
    }

    const token = await getAccessToken(clientId, clientSecret);
    const isGroup = replyContext?.dingtalkIsGroup as boolean ?? false;
    const chunks = this.splitMessage(text, 20000);

    for (const chunk of chunks) {
      if (isGroup) {
        await this.replyGroupMessage(token, binding.channel_id, chunk, clientId);
      } else {
        const senderStaffId = replyContext?.dingtalkSenderStaffId as string || 'unknown';
        await this.sendDirectMessage(token, [senderStaffId], chunk, clientId);
      }
    }
  }

  // ── Private: Stream connection ──

  private async connectBot(binding: IMChannelBindingEntity): Promise<void> {
    const cfg = binding.config as Record<string, string>;
    const clientId = cfg?.client_id;
    const clientSecret = binding.bot_token_enc;

    if (!clientId || !clientSecret) {
      console.warn(`[DINGTALK] Missing client_id or bot_token for binding ${binding.id}, skipping`);
      return;
    }

    // Dynamic import to avoid issues if dingtalk-stream is not installed
    const { DWClient, TOPIC_ROBOT } = await import('dingtalk-stream');

    const dwClient = new DWClient({ clientId, clientSecret });
    const bindingId = binding.id;

    dwClient.registerCallbackListener(TOPIC_ROBOT, (res: { headers: { messageId: string }; data: string }) => {
      // Acknowledge immediately to prevent DingTalk retries
      try {
        dwClient.socketCallBackResponse(res.headers.messageId, {
          response: { statusLine: { code: 200, reasonPhrase: 'OK' }, headers: {}, body: '' },
        });
      } catch (ackErr) {
        console.warn(`[DINGTALK] Failed to ack message:`, ackErr instanceof Error ? ackErr.message : ackErr);
      }

      // Process async
      void (async () => {
        try {
          const data = JSON.parse(res.data) as DingTalkStreamMessage;
          if (data.msgtype !== 'text' || !data.text?.content?.trim()) return;

          const content = data.conversationType === '2'
            ? this.stripBotMentions(data.text.content, data.atUsers)
            : data.text.content.trim();

          if (!content) return;

          const normalized: NormalizedIMMessage = {
            channelType: 'dingtalk',
            channelId: data.conversationId,
            threadId: data.msgId,
            userId: data.senderStaffId || 'unknown',
            userName: data.senderNick,
            text: content,
            bindingId: bindingId,
            isExplicitThread: false, // DingTalk has no thread/topic concept
          };

          await imQueueService.enqueue(normalized, {
            dingtalkSessionWebhook: data.sessionWebhook,
            dingtalkIsGroup: data.conversationType === '2',
            dingtalkSenderStaffId: data.senderStaffId,
          });
        } catch (err) {
          console.error(`[DINGTALK] Error processing stream message:`, err instanceof Error ? err.message : err);
        }
      })();
    });

    await dwClient.connect();
    activeConnections.set(bindingId, { binding, client: dwClient });
    console.log(`[DINGTALK] Stream connected for binding ${bindingId}`);

    // Reconnect on disconnect (network flap, server restart, etc.)
    const reconnect = () => {
      console.warn(`[DINGTALK] Stream disconnected for binding ${bindingId}, reconnecting in 10s...`);
      activeConnections.delete(bindingId);
      setTimeout(() => {
        this.connectBot(binding).catch(err => {
          console.error(`[DINGTALK] Reconnect failed for ${bindingId}:`, err instanceof Error ? err.message : err);
        });
      }, 10_000);
    };
    if (typeof (dwClient as any).on === 'function') {
      (dwClient as any).on('disconnect', reconnect);
      (dwClient as any).on('error', reconnect);
    }
  }

  // ── Private: REST API methods ──

  private async sendViaSessionWebhook(webhookUrl: string, text: string): Promise<void> {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'markdown', markdown: { title: 'Reply', text } }),
    });
    if (!resp.ok) throw new Error(`sessionWebhook failed: ${resp.status}`);
  }

  private async replyGroupMessage(token: string, conversationId: string, text: string, robotCode: string): Promise<void> {
    const resp = await fetch(`${DINGTALK_API}/v1.0/robot/groupMessages/send`, {
      method: 'POST',
      headers: { 'x-acs-dingtalk-access-token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        robotCode,
        openConversationId: conversationId,
        msgParam: JSON.stringify({ title: 'Reply', text }),
        msgKey: 'sampleMarkdown',
      }),
    });
    if (!resp.ok) console.error(`[DINGTALK] replyGroupMessage error: ${resp.status} ${await resp.text()}`);
  }

  private async sendDirectMessage(token: string, userIds: string[], text: string, robotCode: string): Promise<void> {
    const resp = await fetch(`${DINGTALK_API}/v1.0/robot/oToMessages/batchSend`, {
      method: 'POST',
      headers: { 'x-acs-dingtalk-access-token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        robotCode,
        userIds,
        msgParam: JSON.stringify({ title: 'Reply', text }),
        msgKey: 'sampleMarkdown',
      }),
    });
    if (!resp.ok) console.error(`[DINGTALK] sendDirectMessage error: ${resp.status} ${await resp.text()}`);
  }

  private stripBotMentions(text: string, atUsers?: Array<{ dingtalkId: string }>): string {
    if (!atUsers?.length) return text.trim();
    // Remove all @mentions (DingTalk inserts @nickname before the actual message)
    return text.replace(/@\S+\s*/g, '').trim();
  }

  private async discoverBindings(): Promise<IMChannelBindingEntity[]> {
    const { prisma } = await import('../config/database.js');
    return await prisma.im_channel_bindings.findMany({
      where: { channel_type: 'dingtalk', is_enabled: true },
    }) as unknown as IMChannelBindingEntity[];
  }

  private splitMessage(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += maxLen) chunks.push(text.substring(i, i + maxLen));
    return chunks;
  }
}

export const dingtalkAdapter = new DingTalkAdapter();
