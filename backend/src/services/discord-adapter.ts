/**
 * Discord Adapter — Gateway WebSocket Mode
 *
 * Uses discord.js Client to connect to Discord Gateway and receive
 * real-time message events. This is the standard way to build Discord bots.
 *
 * The old Interactions API approach only works for slash commands,
 * not regular chat messages.
 */

import { Client, Events, GatewayIntentBits, Partials, type Message as DjsMessage } from 'discord.js';
import type { IMAdapter, NormalizedIMMessage } from './im.service.js';
import type { IMChannelBindingEntity } from '../repositories/im-channel.repository.js';
import { imChannelRepository } from '../repositories/im-channel.repository.js';
import { imQueueService } from './im-queue.service.js';

/** Active bot connections: bindingId → Client */
const activeClients = new Map<string, Client>();

export class DiscordAdapter implements IMAdapter {
  // ── Webhook verification (kept for PING/PONG endpoint compatibility) ──

  verifyRequest(_headers: Record<string, string>, _body: string): boolean {
    // Gateway mode doesn't use HTTP webhooks for messages.
    // Signature verification is handled by discord.js internally.
    return true;
  }

  parseEvent(_body: unknown): NormalizedIMMessage | null {
    // Gateway mode receives messages via WebSocket, not HTTP.
    // This method is only called for legacy webhook fallback.
    return null;
  }

  // ── Gateway lifecycle ──

  /**
   * Start Gateway connections for all enabled Discord bindings.
   * Called once at app startup.
   */
  async startGateway(): Promise<void> {
    const bindings = await this.discoverBindings();
    if (bindings.length === 0) {
      console.log('[DISCORD] No enabled Discord bindings found, gateway idle');
      return;
    }

    for (const binding of bindings) {
      try {
        await this.connectBot(binding);
      } catch (err) {
        console.error(`[DISCORD] Failed to connect binding ${binding.id}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  /**
   * Stop all Gateway connections. Called on graceful shutdown.
   */
  async stopGateway(): Promise<void> {
    for (const [bindingId, client] of activeClients) {
      try {
        client.destroy();
        console.log(`[DISCORD] Disconnected binding ${bindingId}`);
      } catch (err) {
        console.error(`[DISCORD] Error disconnecting ${bindingId}:`, err instanceof Error ? err.message : err);
      }
    }
    activeClients.clear();
  }

  /**
   * Dynamically add a new bot connection (e.g. when a binding is created via API).
   */
  async addBot(binding: IMChannelBindingEntity): Promise<void> {
    if (activeClients.has(binding.id)) return;
    await this.connectBot(binding);
  }

  /**
   * Remove a bot connection (e.g. when a binding is deleted).
   */
  removeBot(bindingId: string): void {
    const client = activeClients.get(bindingId);
    if (client) {
      client.destroy();
      activeClients.delete(bindingId);
    }
  }

  // ── Send reply via REST API ──

  async sendReply(binding: IMChannelBindingEntity, _threadId: string, text: string): Promise<void> {
    const botToken = binding.bot_token_enc;
    if (!botToken) {
      console.error(`[DISCORD] No bot token for binding ${binding.id}`);
      return;
    }

    const chunks = this.splitMessage(text, 2000);
    for (const chunk of chunks) {
      const response = await fetch(
        `https://discord.com/api/v10/channels/${binding.channel_id}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bot ${botToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: chunk }),
        },
      );
      if (!response.ok) {
        console.error(`[DISCORD] API error: ${response.status} ${await response.text()}`);
      }
    }
  }

  // ── Private ──

  private async connectBot(binding: IMChannelBindingEntity): Promise<void> {
    const botToken = binding.bot_token_enc;
    if (!botToken) {
      console.warn(`[DISCORD] Missing bot token for binding ${binding.id}, skipping`);
      return;
    }

    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel, Partials.Message],
    });

    let botUserId = '';

    client.on(Events.ClientReady, (c) => {
      botUserId = c.user.id;
      console.log(`[DISCORD] Gateway connected: ${c.user.tag} (binding ${binding.id})`);
    });

    client.on(Events.MessageCreate, (message: DjsMessage) => {
      // Ignore bot messages (including self)
      if (message.author.bot) return;
      if (!message.content?.trim()) return;

      // In guilds, only respond when @mentioned
      const isGroup = !!message.guild;
      const isMentioned = message.mentions.users.has(botUserId);
      if (isGroup && !isMentioned) return;

      // Strip @mention from content
      let content = message.content;
      if (isMentioned) {
        content = content.replace(new RegExp(`<@!?${botUserId}>`, 'g'), '').trim();
      }
      if (!content) return;

      const threadId = message.reference?.messageId || message.id;

      const normalized: NormalizedIMMessage = {
        channelType: 'discord',
        channelId: message.channelId,
        threadId,
        userId: message.author.id,
        userName: message.author.username,
        text: content,
        bindingId: binding.id,
        isExplicitThread: !!message.reference?.messageId,
      };

      // Enqueue for async processing
      imQueueService.enqueue(normalized).catch((err) => {
        console.error('[DISCORD] Failed to enqueue message:', err instanceof Error ? err.message : err);
      });
    });

    client.on(Events.Error, (err) => {
      console.error(`[DISCORD] Client error (binding ${binding.id}):`, err);
    });

    await client.login(botToken);
    activeClients.set(binding.id, client);
  }

  private async discoverBindings(): Promise<IMChannelBindingEntity[]> {
    const { prisma } = await import('../config/database.js');
    const bindings = await prisma.im_channel_bindings.findMany({
      where: { channel_type: 'discord', is_enabled: true },
    });
    return bindings as unknown as IMChannelBindingEntity[];
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

  /**
   * Check if payload is a Discord PING (for Interactions endpoint compatibility).
   */
  static isPing(body: unknown): boolean {
    return (body as { type?: number }).type === 1 && !(body as { content?: string }).content;
  }
}

export const discordAdapter = new DiscordAdapter();
