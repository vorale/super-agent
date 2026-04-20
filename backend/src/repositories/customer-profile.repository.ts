import { BaseRepository, type FindAllOptions } from './base.repository.js';

export interface CustomerProfileEntity {
  id: string;
  organization_id: string;
  external_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  source_channel: string | null;
  tags: unknown[];
  custom_fields: Record<string, unknown>;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export class CustomerProfileRepository extends BaseRepository<CustomerProfileEntity> {
  constructor() {
    super('customer_profiles');
  }

  async findByEmail(
    organizationId: string,
    email: string,
  ): Promise<CustomerProfileEntity | null> {
    const all = await this.findAll(organizationId, {
      where: { email } as Partial<CustomerProfileEntity>,
    });
    return all[0] ?? null;
  }

  async findByExternalId(
    organizationId: string,
    externalId: string,
  ): Promise<CustomerProfileEntity | null> {
    const all = await this.findAll(organizationId, {
      where: { external_id: externalId } as Partial<CustomerProfileEntity>,
    });
    return all[0] ?? null;
  }
}

export const customerProfileRepository = new CustomerProfileRepository();
