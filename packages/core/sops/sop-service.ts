/**
 * SopService - Business Logic Layer for SopEntity
 *
 * Handles validation, business rules, and orchestration.
 */

import { Logger } from '@kloudi-os/shared/logger';
import { SopEntity, SopLevel, SopMaturity } from './sop-entity.js';
import type {
  SopEntityData,
  SopLevelType,
  SopMaturityType,
} from './sop-entity.js';
import { SopRepository } from './sop-repository.js';

const logger = Logger.getInstance('sops');

/**
 * Database SOP record type
 */
interface SopRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  level: string;
  maturity: string;
  graph: unknown;
  parameters: unknown;
  constraints: unknown;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * List options interface
 */
interface ListOptions {
  level?: SopLevelType;
  maturity?: SopMaturityType;
  limit?: number;
  offset?: number;
}

/**
 * Search options interface
 */
interface SearchOptions {
  limit?: number;
  offset?: number;
}

/**
 * SopService - Business Logic Layer
 */
export class SopService {
  private repository: SopRepository;

  constructor(repository: SopRepository | null = null) {
    this.repository = repository || new SopRepository();
  }

  async createSop(
    organizationId: string,
    data: SopEntityData
  ): Promise<SopRecord> {
    // Business validation
    if (!data.slug || data.slug.trim().length === 0) {
      throw new Error('SOP slug is required');
    }

    if (!data.name || data.name.trim().length === 0) {
      throw new Error('SOP name is required');
    }

    if (!organizationId) {
      throw new Error('Workspace ID is required');
    }

    // Validate level
    if (
      data.level &&
      !Object.values(SopLevel).includes(
        data.level as (typeof SopLevel)[keyof typeof SopLevel]
      )
    ) {
      throw new Error(`Invalid level: ${data.level}`);
    }

    // Check for duplicate slug
    const existing = await this.repository.findBySlug(
      organizationId,
      data.slug
    );
    if (existing) {
      throw new Error(`SOP with slug "${data.slug}" already exists`);
    }

    // Create entity for validation
    const entity = new SopEntity({
      ...data,
      organizationId,
      maturity: SopMaturity.DRAFT, // Always start as draft
    });

    const validation = entity.validate();
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    return await this.repository.create({
      ...data,
      organizationId,
      maturity: SopMaturity.DRAFT,
    });
  }

  async getSop(organizationId: string, slug: string): Promise<SopRecord> {
    if (!organizationId || !slug) {
      throw new Error('Workspace ID and slug are required');
    }

    const sop = await this.repository.findBySlug(organizationId, slug);
    if (!sop) {
      throw new Error(`SOP not found: ${slug}`);
    }

    return sop;
  }

  async listSops(
    organizationId: string,
    options: ListOptions = {}
  ): Promise<SopRecord[]> {
    if (!organizationId) {
      throw new Error('Workspace ID is required');
    }

    const { level, limit = 20, offset = 0 } = options;

    if (level) {
      return await this.repository.findByLevel(organizationId, level, {
        limit,
        offset,
      });
    }

    // If no level filter, search all
    return await this.repository.search(organizationId, '', { limit, offset });
  }

  async updateSop(
    id: string,
    data: Partial<SopEntityData>
  ): Promise<SopRecord> {
    if (!id) {
      throw new Error('SOP ID is required');
    }

    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new Error('SOP not found');
    }

    // Don't allow changing organizationId
    const updateData = { ...data };
    delete updateData.organizationId;

    // Create entity with merged data for validation
    const entity = new SopEntity({
      ...(existing as unknown as SopEntityData),
      ...updateData,
    });

    const validation = entity.validate();
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    return await this.repository.update(id, updateData);
  }

  async promoteSop(id: string): Promise<SopRecord> {
    if (!id) {
      throw new Error('SOP ID is required');
    }

    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new Error('SOP not found');
    }

    const entity = new SopEntity(existing as unknown as SopEntityData);

    if (!entity.canPromote()) {
      throw new Error('SOP cannot be promoted');
    }

    // Determine next maturity level
    let newMaturity: SopMaturityType;
    switch (existing.maturity) {
      case SopMaturity.DRAFT:
        newMaturity = SopMaturity.CURATED;
        break;
      case SopMaturity.CURATED:
        newMaturity = SopMaturity.VALIDATED;
        break;
      default:
        throw new Error('SOP is already at highest maturity level');
    }

    const updated = await this.repository.update(id, { maturity: newMaturity });

    logger.info(`SOP ${id} promoted to ${newMaturity}`);
    return updated;
  }

  async deleteSop(id: string): Promise<boolean> {
    if (!id) {
      throw new Error('SOP ID is required');
    }

    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new Error('SOP not found');
    }

    return await this.repository.delete(id);
  }

  async searchSops(
    organizationId: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<SopRecord[]> {
    if (!organizationId) {
      throw new Error('Workspace ID is required');
    }

    return await this.repository.search(organizationId, query, options);
  }
}

export default SopService;
