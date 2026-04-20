import { prisma } from '../config/database.js';
import crypto from 'crypto';

export interface WidgetAuthResult {
  valid: boolean;
  organizationId?: string;
  scopeId?: string;
  error?: string;
}

class WidgetAuthService {
  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  async authenticate(apiKey: string): Promise<WidgetAuthResult> {
    if (!apiKey || !apiKey.startsWith('sk_')) {
      return { valid: false, error: 'Invalid API key format' };
    }

    const hash = this.hashKey(apiKey);
    const record = await prisma.api_keys.findUnique({
      where: { key_hash: hash },
      include: {
        organizations: {
          select: { id: true },
        },
      },
    });

    if (!record) {
      return { valid: false, error: 'API key not found' };
    }

    if (!record.is_active) {
      return { valid: false, error: 'API key is disabled' };
    }

    if (record.expires_at && record.expires_at < new Date()) {
      return { valid: false, error: 'API key has expired' };
    }

    const scopes: string[] = Array.isArray(record.scopes)
      ? record.scopes
      : JSON.parse(record.scopes as string);

    if (!scopes.includes('widget:connect')) {
      return { valid: false, error: 'API key lacks widget:connect scope' };
    }

    // Update last used
    await prisma.api_keys.update({
      where: { id: record.id },
      data: { last_used_at: new Date() },
    });

    return {
      valid: true,
      organizationId: record.organization_id,
    };
  }
}

export const widgetAuthService = new WidgetAuthService();
