/**
 * Customer Profile Repository
 * Data access layer for customer_profiles with multi-tenancy support.
 */

import { prisma } from '../config/database.js';

export interface CustomerProfileEntity {
  id: string;
  organization_id: string;
  external_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  source_channel: string | null;
  tags: string[];
  custom_fields: Record<string, string | number | boolean | null>;
  notes: string | null;
  metadata: Record<string, string | number | boolean | null>;
  created_at: Date;
  updated_at: Date;
}

export class CustomerProfileRepository {
  async findById(id: string, organizationId: string): Promise<CustomerProfileEntity | null> {
    return prisma.customer_profiles.findFirst({
      where: { id, organization_id: organizationId },
    }) as unknown as CustomerProfileEntity | null;
  }

  async findByExternalId(externalId: string, organizationId: string): Promise<CustomerProfileEntity | null> {
    return prisma.customer_profiles.findFirst({
      where: { external_id: externalId, organization_id: organizationId },
    }) as unknown as CustomerProfileEntity | null;
  }

  async findByEmail(email: string, organizationId: string): Promise<CustomerProfileEntity | null> {
    return prisma.customer_profiles.findFirst({
      where: { email, organization_id: organizationId },
    }) as unknown as CustomerProfileEntity | null;
  }

  async create(
    data: Omit<CustomerProfileEntity, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<CustomerProfileEntity> {
    return prisma.customer_profiles.create({ data }) as unknown as CustomerProfileEntity;
  }

  async update(
    id: string,
    organizationId: string,
    data: Partial<Omit<CustomerProfileEntity, 'id' | 'organization_id' | 'created_at'>>,
  ): Promise<CustomerProfileEntity | null> {
    const existing = await this.findById(id, organizationId);
    if (!existing) return null;
    return prisma.customer_profiles.update({
      where: { id },
      data,
    }) as unknown as CustomerProfileEntity;
  }

  async upsertByExternalId(
    organizationId: string,
    externalId: string,
    data: { name: string; email?: string; sourceChannel?: string },
  ): Promise<CustomerProfileEntity> {
    const existing = await this.findByExternalId(externalId, organizationId);
    if (existing) {
      return prisma.customer_profiles.update({
        where: { id: existing.id },
        data: { name: data.name, email: data.email ?? existing.email },
      }) as unknown as CustomerProfileEntity;
    }
    return this.create({
      organization_id: organizationId,
      external_id: externalId,
      name: data.name,
      email: data.email ?? null,
      phone: null,
      avatar_url: null,
      source_channel: data.sourceChannel ?? null,
      tags: [] as string[],
      custom_fields: {} as Record<string, string | number | boolean | null>,
      notes: null,
      metadata: {} as Record<string, string | number | boolean | null>,
    });
  }

  async findRecentConversations(customerId: string, organizationId: string, limit = 20) {
    return prisma.support_conversations.findMany({
      where: { customer_id: customerId, organization_id: organizationId },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
  }
}

export const customerProfileRepository = new CustomerProfileRepository();
