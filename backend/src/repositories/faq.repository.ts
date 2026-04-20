import { BaseRepository, type FindAllOptions } from './base.repository.js';

export type FaqStatus = 'draft' | 'published' | 'archived';

export interface FaqArticleEntity {
  id: string;
  organization_id: string;
  business_scope_id: string | null;
  question: string;
  answer: string;
  category: string | null;
  tags: unknown[];
  view_count: number;
  helpful_count: number;
  not_helpful_count: number;
  status: FaqStatus;
  sort_order: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export class FaqArticleRepository extends BaseRepository<FaqArticleEntity> {
  constructor() {
    super('faq_articles');
  }

  async findPublished(
    organizationId: string,
    options?: Omit<FindAllOptions<FaqArticleEntity>, 'where'>
  ): Promise<FaqArticleEntity[]> {
    return this.findAll(organizationId, {
      ...options,
      where: { status: 'published' as FaqStatus },
    });
  }

  async findByCategory(
    organizationId: string,
    category: string,
    options?: Omit<FindAllOptions<FaqArticleEntity>, 'where'>
  ): Promise<FaqArticleEntity[]> {
    return this.findAll(organizationId, {
      ...options,
      where: { category },
    });
  }

  async findByScope(
    organizationId: string,
    scopeId: string,
    options?: Omit<FindAllOptions<FaqArticleEntity>, 'where'>
  ): Promise<FaqArticleEntity[]> {
    return this.findAll(organizationId, {
      ...options,
      where: { business_scope_id: scopeId },
    });
  }

  async incrementViewCount(id: string): Promise<void> {
    await this.getModel().update({
      where: { id },
      data: { view_count: { increment: 1 } },
    });
  }

  async markHelpful(id: string, helpful: boolean): Promise<void> {
    const field = helpful ? 'helpful_count' : 'not_helpful_count';
    await this.getModel().update({
      where: { id },
      data: { [field]: { increment: 1 } },
    });
  }
}

export const faqArticleRepository = new FaqArticleRepository();
