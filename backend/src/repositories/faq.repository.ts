/**
 * FAQ Repository
 * Data access layer for faq_articles with multi-tenancy support.
 */

import { prisma } from '../config/database.js';

export interface FaqArticleEntity {
  id: string;
  organization_id: string;
  business_scope_id: string | null;
  question: string;
  answer: string;
  category: string | null;
  tags: string[];
  view_count: number;
  helpful_count: number;
  not_helpful_count: number;
  status: string;
  sort_order: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export class FaqRepository {
  async findAll(
    organizationId: string,
    filters?: { status?: string; category?: string; businessScopeId?: string },
    skip = 0,
    take = 50,
  ): Promise<{ data: FaqArticleEntity[]; total: number }> {
    const where: Record<string, unknown> = { organization_id: organizationId };
    if (filters?.status) where.status = filters.status;
    if (filters?.category) where.category = filters.category;
    if (filters?.businessScopeId) where.business_scope_id = filters.businessScopeId;

    const [data, total] = await Promise.all([
      prisma.faq_articles.findMany({
        where,
        orderBy: [{ sort_order: 'asc' }, { created_at: 'desc' }],
        skip,
        take,
      }),
      prisma.faq_articles.count({ where }),
    ]);

    return { data: data as unknown as FaqArticleEntity[], total };
  }

  async findById(id: string, organizationId: string): Promise<FaqArticleEntity | null> {
    return prisma.faq_articles.findFirst({
      where: { id, organization_id: organizationId },
    }) as unknown as FaqArticleEntity | null;
  }

  async create(
    data: Omit<FaqArticleEntity, 'id' | 'created_at' | 'updated_at' | 'view_count' | 'helpful_count' | 'not_helpful_count'>,
  ): Promise<FaqArticleEntity> {
    return prisma.faq_articles.create({ data }) as unknown as FaqArticleEntity;
  }

  async update(
    id: string,
    organizationId: string,
    data: Partial<Omit<FaqArticleEntity, 'id' | 'organization_id' | 'created_at'>>,
  ): Promise<FaqArticleEntity | null> {
    const existing = await this.findById(id, organizationId);
    if (!existing) return null;
    return prisma.faq_articles.update({
      where: { id },
      data,
    }) as unknown as FaqArticleEntity;
  }

  async delete(id: string, organizationId: string): Promise<boolean> {
    const existing = await this.findById(id, organizationId);
    if (!existing) return false;
    await prisma.faq_articles.delete({ where: { id } });
    return true;
  }

  async incrementViewCount(id: string): Promise<void> {
    await prisma.faq_articles.update({
      where: { id },
      data: { view_count: { increment: 1 } },
    });
  }

  async findPublished(
    organizationId: string,
    businessScopeId?: string,
    category?: string,
  ): Promise<FaqArticleEntity[]> {
    const where: Record<string, unknown> = {
      organization_id: organizationId,
      status: 'published',
    };
    if (businessScopeId) where.business_scope_id = businessScopeId;
    if (category) where.category = category;

    return prisma.faq_articles.findMany({
      where,
      orderBy: [{ view_count: 'desc' }, { sort_order: 'asc' }],
    }) as unknown as FaqArticleEntity[];
  }

  async findDrafts(organizationId: string): Promise<FaqArticleEntity[]> {
    return prisma.faq_articles.findMany({
      where: { organization_id: organizationId, status: 'draft' },
      orderBy: { created_at: 'desc' },
    }) as unknown as FaqArticleEntity[];
  }
}

export const faqRepository = new FaqRepository();
