/**
 * Business Hours Service
 * Determines whether the current time falls within configured business hours.
 */

import { prisma } from '../config/database.js';

export class BusinessHoursService {
  /**
   * Check if the current time is within business hours for the organization.
   * Returns the active business hours config and whether we're currently online.
   */
  async isWithinBusinessHours(organizationId: string): Promise<{
    isOnline: boolean;
    offlineMessage: string | null;
    configName: string | null;
  }> {
    const configs = await prisma.business_hours.findMany({
      where: { organization_id: organizationId, is_active: true },
      take: 1,
    });

    if (configs.length === 0) {
      // No business hours configured = always online
      return { isOnline: true, offlineMessage: null, configName: null };
    }

    const config = configs[0]!;
    const now = new Date();

    // Convert to the configured timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: config.timezone,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const weekday = parts.find(p => p.type === 'weekday')?.value?.toLowerCase() ?? '';
    const hour = parts.find(p => p.type === 'hour')?.value ?? '00';
    const minute = parts.find(p => p.type === 'minute')?.value ?? '00';
    const currentTime = `${hour}:${minute}`;

    // Check holiday dates
    const holidays = (config.holiday_dates as string[]) ?? [];
    const todayStr = now.toISOString().split('T')[0]!;
    if (holidays.includes(todayStr)) {
      return { isOnline: false, offlineMessage: config.offline_message, configName: config.name };
    }

    // Get start/end for today's weekday
    const dayMap: Record<string, { start: string | null; end: string | null }> = {
      monday: { start: config.monday_start, end: config.monday_end },
      tuesday: { start: config.tuesday_start, end: config.tuesday_end },
      wednesday: { start: config.wednesday_start, end: config.wednesday_end },
      thursday: { start: config.thursday_start, end: config.thursday_end },
      friday: { start: config.friday_start, end: config.friday_end },
      saturday: { start: config.saturday_start, end: config.saturday_end },
      sunday: { start: config.sunday_start, end: config.sunday_end },
    };

    const todayHours = dayMap[weekday];
    if (!todayHours?.start || !todayHours?.end) {
      return { isOnline: false, offlineMessage: config.offline_message, configName: config.name };
    }

    const isOnline = currentTime >= todayHours.start && currentTime <= todayHours.end;
    return {
      isOnline,
      offlineMessage: isOnline ? null : config.offline_message,
      configName: config.name,
    };
  }
}

export const businessHoursService = new BusinessHoursService();
