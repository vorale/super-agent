/**
 * WeCom (企业微信) IM Adapter
 *
 * Implements the IMAdapter interface for WeCom integration.
 *
 * Supports two modes:
 *
 * 1. **Bot mode** (WebSocket) — Uses @wecom/aibot-node-sdk WSClient for
 *    long-polling WebSocket connections. Supports streaming replies.
 *    Config: bot_id + secret stored in binding.config
 *
 * 2. **Agent mode** (HTTP webhook) — Receives XML-encrypted callbacks via
 *    the /api/im/wecom/callback endpoint. Replies via WeCom REST API
 *    (cgi-bin/message/send). Config: corp_id + corp_secret + agent_id +
 *    token + encoding_aes_key stored in binding.config
 *
 * Both modes can coexist on the same binding. Bot mode is preferred for
 * receiving messages (streaming support); Agent mode is used as fallback
 * for outbound replies when Bot WS is unavailable.
 */

import crypto from 'node:crypto';
import type { IMAdapter, NormalizedIMMessage } from './im.service.js';
import type { IMChannelBindingEntity } from '../repositories/im-channel.repository.js';
import { imQueueService } from './im-queue.service.js';

// ============================================================================
// Constants
// ============================================================================

const WECOM_API = 'https://qyapi.weixin.qq.com';
const REPLY_TIMEOUT_MS = 10_000;
const RECONNECT_DELAY_MS = 10_000;
const MAX_MESSAGE_LEN = 2048;

// ============================================================================
// Access Token Cache
// ============================================================================

interface CachedToken {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();

/**
 * Get an access token for WeCom Agent API.
 * Tokens are cached and refreshed 5 minutes before expiry.
 */
async function getAccessToken(corpId: string, corpSecret: string): Promise<string> {
  const cacheKey = `${corpId}:${corpSecret}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 300_000) {
    return cached.token;
  }

  const url = `${WECOM_API}/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(corpSecret)}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`WeCom gettoken failed: ${resp.status}`);
  }

  const data = (await resp.json()) as { errcode: number; errmsg: string; access_token?: string; expires_in?: number };
  if (data.errcode !== 0 || !data.access_token) {
    throw new Error(`WeCom gettoken error: ${data.errcode} ${data.errmsg}`);
  }

  const entry: CachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000,
  };
  tokenCache.set(cacheKey, entry);
  return entry.token;
}

// ============================================================================
// Bot Mode — WebSocket connections via @wecom/aibot-node-sdk
// ============================================================================

interface WeComBotConnection {
  binding: IMChannelBindingEntity;
  client: any; // WSClient from @wecom/aibot-node-sdk
}

const activeBotConnections = new Map<string, WeComBotConnection>();

// ============================================================================
// Agent Mode — XML Crypto Helpers
// ============================================================================

/**
 * Verify WeCom Agent callback signature.
 * signature = SHA1(sort([token, timestamp, nonce, encrypt]))
 */
function verifyAgentSignature(
  token: string,
  timestamp: string,
  nonce: string,
  encrypt: string,
  signature: string,
): boolean {
  const arr = [token, timestamp, nonce, encrypt].sort();
  const hash = crypto.createHash('sha1').update(arr.join('')).digest('hex');
  return hash === signature;
}

/**
 * Decrypt WeCom Agent AES-256-CBC encrypted message.
 * Key = Base64Decode(encodingAESKey + '='), IV = key[0..16]
 */
function decryptAgentMessage(encodingAESKey: string, encrypted: string): string {
  const aesKey = Buffer.from(encodingAESKey + '=', 'base64');
  const iv = aesKey.subarray(0, 16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
  decipher.setAutoPadding(false);

  const decrypted = Buffer.concat([decipher.update(encrypted, 'base64'), decipher.final()]);

  // PKCS#7 unpadding
  const pad = decrypted[decrypted.length - 1] ?? 0;
  const content = decrypted.subarray(0, decrypted.length - pad);

  // Format: 16 bytes random + 4 bytes msg_len (big-endian) + msg + receiveid
  const msgLen = content.readUInt32BE(16);
  const msg = content.subarray(20, 20 + msgLen).toString('utf8');
  return msg;
}

/**
 * Extract <Encrypt> value from WeCom XML body.
 */
function extractEncryptFromXml(xml: string): string {
  const match = xml.match(/<Encrypt><!\[CDATA\[(.*?)\]\]><\/Encrypt>/s)
    || xml.match(/<Encrypt>(.*?)<\/Encrypt>/s);
  if (!match?.[1]) {
    throw new Error('Missing <Encrypt> in XML body');
  }
  return match[1];
}

/**
 * Parse simple WeCom Agent XML message fields.
 * Returns a flat key-value map of the XML root element's children.
 */
function parseSimpleXml(xml: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /<(\w+)>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/\1>/gs;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(xml)) !== null) {
    const key = m[1];
    if (key) {
      result[key] = m[2] ?? m[3] ?? '';
    }
  }
  return result;
}

// ============================================================================
// WeComAdapter
// ============================================================================

export class WeComAdapter implements IMAdapter {
  // ── Request verification ──

  /**
   * Verify incoming webhook request.
   *
   * For Agent mode (XML callbacks), verification is done inline in the
   * webhook route handler using verifyAgentSignature + decryptAgentMessage.
   *
   * For Bot mode, messages arrive via WebSocket (no HTTP verification needed).
   *
   * This method handles the generic webhook path (/api/im/webhook/:bindingId)
   * where we trust the binding lookup.
   */
  verifyRequest(_headers: Record<string, string>, _body: string): boolean {
    // Agent mode verification is handled in the dedicated route handler.
    // Bot mode uses WebSocket (no HTTP signature).
    // Generic webhook path trusts binding lookup.
    return true;
  }

  // ── Parse event (Agent mode HTTP callback) ──

  /**
   * Parse a decrypted WeCom Agent XML message into a NormalizedIMMessage.
   *
   * The body passed here is expected to be the pre-parsed object from
   * the webhook route, containing { decryptedXml, corpId, bindingId }.
   */
  parseEvent(body: unknown): NormalizedIMMessage | null {
    const payload = body as {
      decryptedXml?: string;
      corpId?: string;
      bindingId?: string;
    };

    if (!payload.decryptedXml) return null;

    const fields = parseSimpleXml(payload.decryptedXml);
    const msgType = (fields.MsgType || '').toLowerCase();

    // Only handle text and voice (with recognition) messages
    let text = '';
    if (msgType === 'text') {
      text = fields.Content || '';
    } else if (msgType === 'voice') {
      text = fields.Recognition || '';
    } else if (msgType === 'event') {
      // Skip events for now (subscribe, click, etc.)
      return null;
    } else {
      // Image, video, file, location, link — not handled as text
      return null;
    }

    if (!text.trim()) return null;

    const fromUser = fields.FromUserName || 'unknown';
    const toUser = fields.ToUserName || '';
    const msgId = fields.MsgId || `wecom-agent-${Date.now()}`;

    return {
      channelType: 'wecom',
      channelId: toUser, // CorpID or the receiving account
      threadId: msgId,
      userId: fromUser,
      text: text.trim(),
      bindingId: payload.bindingId,
      isExplicitThread: false, // WeCom has no thread/topic concept
    };
  }

  // ── Gateway lifecycle (Bot mode WebSocket) ──

  async startGateway(): Promise<void> {
    const bindings = await this.discoverBindings();
    if (bindings.length === 0) {
      console.log('[WECOM] No enabled WeCom bindings found, gateway idle');
      return;
    }

    for (const binding of bindings) {
      try {
        await this.connectBot(binding);
      } catch (err) {
        console.error(
          `[WECOM] Failed to connect binding ${binding.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  async stopGateway(): Promise<void> {
    for (const [bindingId, conn] of activeBotConnections) {
      try {
        if (conn.client?.close) {
          await conn.client.close();
        }
      } catch {
        // best effort
      }
      console.log(`[WECOM] Disconnected binding ${bindingId}`);
    }
    activeBotConnections.clear();
  }

  async addBot(binding: IMChannelBindingEntity): Promise<void> {
    if (activeBotConnections.has(binding.id)) return;
    await this.connectBot(binding);
  }

  removeBot(bindingId: string): void {
    const conn = activeBotConnections.get(bindingId);
    if (conn?.client?.close) {
      try { conn.client.close(); } catch { /* best effort */ }
    }
    activeBotConnections.delete(bindingId);
  }

  // ── Send reply ──

  /**
   * Send a reply back to WeCom.
   *
   * Priority:
   * 1. Bot WebSocket replyStream (if connected) — supports markdown
   * 2. Agent REST API (cgi-bin/message/send) — fallback
   */
  async sendReply(
    binding: IMChannelBindingEntity,
    _threadId: string,
    text: string,
    replyContext?: Record<string, unknown>,
  ): Promise<void> {
    const cfg = binding.config as Record<string, unknown>;

    // Priority 1: Bot WebSocket reply
    const botConn = activeBotConnections.get(binding.id);
    if (botConn?.client?.isConnected) {
      try {
        await this.sendViaBotWs(botConn, text, replyContext);
        return;
      } catch (err) {
        console.warn(
          `[WECOM] Bot WS reply failed, falling back to Agent API:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Priority 2: Agent REST API
    const corpId = cfg.corp_id as string | undefined;
    const corpSecret = cfg.corp_secret as string | undefined;
    const agentId = cfg.agent_id as string | number | undefined;

    if (!corpId || !corpSecret) {
      console.error(`[WECOM] No reply method available for binding ${binding.id} (no Bot WS, no Agent API credentials)`);
      return;
    }

    const token = await getAccessToken(corpId, corpSecret);
    const toUser = (replyContext?.wecomFromUser as string) || '';

    if (!toUser) {
      console.error(`[WECOM] Cannot send Agent API reply: missing target user`);
      return;
    }

    const chunks = this.splitMessage(text, MAX_MESSAGE_LEN);
    for (const chunk of chunks) {
      await this.sendViaAgentApi(token, toUser, chunk, agentId);
    }
  }

  // ── Private: Bot WebSocket connection ──

  private async connectBot(binding: IMChannelBindingEntity): Promise<void> {
    const cfg = binding.config as Record<string, unknown>;
    const botId = cfg.bot_id as string | undefined;
    const secret = cfg.secret as string | undefined;

    if (!botId || !secret) {
      console.warn(`[WECOM] Missing bot_id or secret for binding ${binding.id}, skipping Bot mode`);
      return;
    }

    // Dynamic import to avoid issues if @wecom/aibot-node-sdk is not installed
    // @ts-expect-error — optional peer dependency, may not have type declarations
    const { WSClient, generateReqId } = await import('@wecom/aibot-node-sdk');

    const bindingId = binding.id;
    const wsClient = new WSClient({ botId, secret });

    wsClient.on('message', (frame: any) => {
      // Process async — don't block the WebSocket event loop
      void (async () => {
        try {
          const body = frame.body as Record<string, any>;
          const msgType = body?.msgtype as string;

          // Extract text content based on message type
          let text = '';
          if (msgType === 'text' && body.text?.content) {
            text = body.text.content;
          } else if (msgType === 'voice' && body.voice?.content) {
            // Voice-to-text transcription
            text = body.voice.content;
          } else if (msgType === 'mixed' && body.mixed?.msg_item) {
            // Mixed message — extract text parts
            const parts: string[] = [];
            for (const item of body.mixed.msg_item) {
              if (item.msgtype === 'text' && item.text?.content) {
                parts.push(item.text.content);
              }
            }
            text = parts.join('\n');
          } else if (msgType === 'event') {
            // Skip events in Bot mode for now
            return;
          } else {
            // Image, video, file — not handled as text
            return;
          }

          if (!text.trim()) return;

          // Strip @bot mentions in group chats
          const chatType = body.chattype as string;
          if (chatType === 'group') {
            text = this.stripBotMentions(text);
          }

          if (!text.trim()) return;

          const normalized: NormalizedIMMessage = {
            channelType: 'wecom',
            channelId: body.chatid || body.from?.userid || '',
            threadId: body.msgid || `wecom-${Date.now()}`,
            userId: body.from?.userid || 'unknown',
            text: text.trim(),
            bindingId,
            isExplicitThread: false, // WeCom has no thread/topic concept
          };

          await imQueueService.enqueue(normalized, {
            wecomFrame: frame,
            wecomBotBindingId: bindingId,
            wecomFromUser: body.from?.userid,
            wecomChatType: chatType,
            wecomChatId: body.chatid,
          });
        } catch (err) {
          console.error(
            `[WECOM] Error processing Bot WS message:`,
            err instanceof Error ? err.message : err,
          );
        }
      })();
    });

    await wsClient.start();
    activeBotConnections.set(bindingId, { binding, client: wsClient });
    console.log(`[WECOM] Bot WS connected for binding ${bindingId}`);

    // Reconnect on disconnect
    wsClient.on('close', () => {
      console.warn(`[WECOM] Bot WS disconnected for binding ${bindingId}, reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`);
      activeBotConnections.delete(bindingId);
      setTimeout(() => {
        this.connectBot(binding).catch((err) => {
          console.error(
            `[WECOM] Reconnect failed for ${bindingId}:`,
            err instanceof Error ? err.message : err,
          );
        });
      }, RECONNECT_DELAY_MS);
    });

    wsClient.on('error', (err: Error) => {
      console.error(`[WECOM] Bot WS error for binding ${bindingId}:`, err.message);
    });
  }

  // ── Private: Bot WebSocket reply ──

  private async sendViaBotWs(
    conn: WeComBotConnection,
    text: string,
    replyContext?: Record<string, unknown>,
  ): Promise<void> {
    // @ts-expect-error — optional peer dependency, may not have type declarations
    const { generateReqId } = await import('@wecom/aibot-node-sdk');

    const frame = replyContext?.wecomFrame as any;
    if (!frame) {
      throw new Error('No wecomFrame in replyContext — cannot reply via Bot WS');
    }

    const streamId = generateReqId('stream');
    const client = conn.client;

    // Send as a single finished stream message (non-streaming for simplicity)
    await Promise.race([
      client.replyStream(frame, streamId, text, true),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Bot WS reply timed out')), REPLY_TIMEOUT_MS),
      ),
    ]);
  }

  // ── Private: Agent REST API reply ──

  private async sendViaAgentApi(
    accessToken: string,
    toUser: string,
    text: string,
    agentId?: string | number,
  ): Promise<void> {
    const body: Record<string, unknown> = {
      touser: toUser,
      msgtype: 'markdown',
      agentid: agentId ?? 0,
      markdown: { content: text },
    };

    const url = `${WECOM_API}/cgi-bin/message/send?access_token=${encodeURIComponent(accessToken)}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      console.error(`[WECOM] Agent API send error: ${resp.status} ${await resp.text()}`);
      return;
    }

    const data = (await resp.json()) as { errcode: number; errmsg: string };
    if (data.errcode !== 0) {
      console.error(`[WECOM] Agent API send error: ${data.errcode} ${data.errmsg}`);
    }
  }

  // ── Private: helpers ──

  private async discoverBindings(): Promise<IMChannelBindingEntity[]> {
    const { prisma } = await import('../config/database.js');
    return (await prisma.im_channel_bindings.findMany({
      where: { channel_type: 'wecom', is_enabled: true },
    })) as unknown as IMChannelBindingEntity[];
  }

  private stripBotMentions(text: string): string {
    // WeCom group messages prefix @botname before the actual content
    return text.replace(/@\S+\s*/g, '').trim();
  }

  private splitMessage(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += maxLen) {
      chunks.push(text.substring(i, i + maxLen));
    }
    return chunks;
  }
}

// ── Exported singleton + static helpers for route handler ──

export const wecomAdapter = new WeComAdapter();

/**
 * Static helpers exported for use in the webhook route handler.
 * Agent mode requires inline verification + decryption before parseEvent.
 */
export const WeComAgentCrypto = {
  verifySignature: verifyAgentSignature,
  decrypt: decryptAgentMessage,
  extractEncrypt: extractEncryptFromXml,
  parseXml: parseSimpleXml,
};
