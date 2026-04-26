/**
 * Widget Auth Service
 * Authenticates Widget API requests using existing api_keys table.
 * Validates SHA256 hash match and checks for 'widget:connect' scope.
 */

import { createHash } from 'crypto';
import { prisma } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';

export interface WidgetAuthResult {
  organizationId: string;
  userId: string;
  keyId: string;
}

/** System user ID for widget sessions (all-zero UUID) */
export const WIDGET_SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

export class WidgetAuthService {
  /**
   * Authenticate a widget request using Bearer token from api_keys.
   * The token is hashed with SHA256 and matched against key_hash.
   */
  async authenticate(bearerToken: string): Promise<WidgetAuthResult> {
    if (!bearerToken) {
      throw AppError.unauthorized('Missing API key');
    }

    const keyHash = createHash('sha256').update(bearerToken).digest('hex');

    const apiKey = await prisma.api_keys.findFirst({
      where: {
        key_hash: keyHash,
        is_active: true,
      },
    });

    if (!apiKey) {
      throw AppError.unauthorized('Invalid API key');
    }

    // Check expiry
    if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
      throw AppError.unauthorized('API key has expired');
    }

    // Check widget:connect scope
    const scopes = apiKey.scopes as string[];
    if (!scopes.includes('widget:connect')) {
      throw AppError.forbidden('API key does not have widget:connect scope');
    }

    // Update last_used_at
    await prisma.api_keys.update({
      where: { id: apiKey.id },
      data: { last_used_at: new Date() },
    }).catch(() => { /* non-critical */ });

    return {
      organizationId: apiKey.organization_id,
      userId: apiKey.user_id,
      keyId: apiKey.id,
    };
  }
}

export const widgetAuthService = new WidgetAuthService();
