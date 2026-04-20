/**
 * Business Hours Service
 *
 * Manages business hours configuration and checks
 * whether the current time is within business hours.
 */

import { prisma } from '../config/database.js';

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

export class BusinessHoursService {

  /**
   * Check if the current time is within business hours for an organization.
   */
  async isWithinBusinessHours(organizationId: string, date?: Date): Promise<{
    isWithinHours: boolean;
    scheduleName?: string;
    offlineMessage?: string;
  }> {
    const config = await prisma.business_hours.findFirst({
      where: { organization_id: organizationId, is_active: true },
    });

    if (!config) return { isWithinHours: true }; // No config = always open

    const now = date ?? new Date();

    // Check holidays
    const holidays = (config.holiday_dates as string[]) || [];
    const todayStr = now.toISOString().split('T')[0];
    if (holidays.includes(todayStr!)) {
      return { isWithinHours: false, scheduleName: config.name, offlineMessage: config.offline_message ?? undefined };
    }

    // Check day schedule
    const dayOfWeek = now.getDay(); // 0=Sunday
    const dayKey = DAY_KEYS[dayOfWeek];
    const startTime = (config as Record<string, unknown>)[`${dayKey}_start`] as string | null;
    const endTime = (config as Record<string, unknown>)[`${dayKey}_end`] as string | null;

    if (!startTime || !endTime) {
      return { isWithinHours: false, scheduleName: config.name, offlineMessage: config.offline_message ?? undefined };
    }

    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return {
      isWithinHours: currentTime >= startTime && currentTime <= endTime,
      scheduleName: config.name,
      offlineMessage: config.offline_message ?? undefined,
    };
  }

  /**
   * Get business hours config for an organization.
   */
  async getConfig(organizationId: string) {
    return prisma.business_hours.findFirst({
      where: { organization_id: organizationId },
    });
  }

  /**
   * Upsert business hours config.
   */
  async upsertConfig(data: {
    organizationId: string;
    name: string;
    timezone?: string;
    schedule: Record<string, { start?: string; end?: string } | null>;
    holidayDates?: string[];
    offlineMessage?: string;
  }) {
    const existing = await prisma.business_hours.findFirst({
      where: { organization_id: data.organizationId },
    });

    const buildData = (_configId?: string) => {
      const d: Record<string, unknown> = {
        organization_id: data.organizationId,
        name: data.name,
        timezone: data.timezone ?? 'Asia/Shanghai',
        holiday_dates: data.holidayDates ?? [],
        offline_message: data.offlineMessage ?? null,
        is_active: true,
      };
      for (const day of DAY_KEYS) {
        const slot = data.schedule[day];
        d[`${day}_start`] = slot?.start ?? null;
        d[`${day}_end`] = slot?.end ?? null;
      }
      return d;
    };

    if (existing) {
      return prisma.business_hours.update({
        where: { id: existing.id },
        data: buildData(existing.id),
      });
    }

    return prisma.business_hours.create({ data: buildData() as any });
  }
}

export const businessHoursService = new BusinessHoursService();
