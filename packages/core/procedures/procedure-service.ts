/**
 * ProcedureService - Business Logic Layer for ProceduralEntity
 *
 * Handles validation, business rules, and orchestration.
 */

import { Logger } from '@kloudi/shared/logger';
import {
  ProceduralEntity,
  ProcedureLevel,
  ProcedureMaturity,
} from './procedure-entity.js';
import type {
  ProcedureEntityData,
  ProcedureLevelType,
  ProcedureMaturityType,
} from './procedure-entity.js';
import { ProcedureRepository } from './procedure-repository.js';

const logger = Logger.getInstance('procedures');

/**
 * Database procedure record type
 */
interface ProcedureRecord {
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
  level?: ProcedureLevelType;
  maturity?: ProcedureMaturityType;
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
 * ProcedureService - Business Logic Layer
 */
export class ProcedureService {
  private repository: ProcedureRepository;

  constructor(repository: ProcedureRepository | null = null) {
    this.repository = repository || new ProcedureRepository();
  }

  async createProcedure(
    organizationId: string,
    data: ProcedureEntityData
  ): Promise<ProcedureRecord> {
    // Business validation
    if (!data.slug || data.slug.trim().length === 0) {
      throw new Error('Procedure slug is required');
    }

    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Procedure name is required');
    }

    if (!organizationId) {
      throw new Error('Workspace ID is required');
    }

    // Validate level
    if (
      data.level &&
      !Object.values(ProcedureLevel).includes(
        data.level as (typeof ProcedureLevel)[keyof typeof ProcedureLevel]
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
      throw new Error(`Procedure with slug "${data.slug}" already exists`);
    }

    // Create entity for validation
    const entity = new ProceduralEntity({
      ...data,
      organizationId,
      maturity: ProcedureMaturity.DRAFT, // Always start as draft
    });

    const validation = entity.validate();
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    return await this.repository.create({
      ...data,
      organizationId,
      maturity: ProcedureMaturity.DRAFT,
    });
  }

  async getProcedure(
    organizationId: string,
    slug: string
  ): Promise<ProcedureRecord> {
    if (!organizationId || !slug) {
      throw new Error('Workspace ID and slug are required');
    }

    const procedure = await this.repository.findBySlug(organizationId, slug);
    if (!procedure) {
      throw new Error(`Procedure not found: ${slug}`);
    }

    return procedure;
  }

  async listProcedures(
    organizationId: string,
    options: ListOptions = {}
  ): Promise<ProcedureRecord[]> {
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

  async updateProcedure(
    id: string,
    data: Partial<ProcedureEntityData>
  ): Promise<ProcedureRecord> {
    if (!id) {
      throw new Error('Procedure ID is required');
    }

    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new Error('Procedure not found');
    }

    // Don't allow changing organizationId
    const updateData = { ...data };
    delete updateData.organizationId;

    // Create entity with merged data for validation
    const entity = new ProceduralEntity({
      ...(existing as unknown as ProcedureEntityData),
      ...updateData,
    });

    const validation = entity.validate();
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    return await this.repository.update(id, updateData);
  }

  async promoteProcedure(id: string): Promise<ProcedureRecord> {
    if (!id) {
      throw new Error('Procedure ID is required');
    }

    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new Error('Procedure not found');
    }

    const entity = new ProceduralEntity(
      existing as unknown as ProcedureEntityData
    );

    if (!entity.canPromote()) {
      throw new Error('Procedure cannot be promoted');
    }

    // Determine next maturity level
    let newMaturity: ProcedureMaturityType;
    switch (existing.maturity) {
      case ProcedureMaturity.DRAFT:
        newMaturity = ProcedureMaturity.CURATED;
        break;
      case ProcedureMaturity.CURATED:
        newMaturity = ProcedureMaturity.VALIDATED;
        break;
      default:
        throw new Error('Procedure is already at highest maturity level');
    }

    const updated = await this.repository.update(id, { maturity: newMaturity });

    logger.info(`Procedure ${id} promoted to ${newMaturity}`);
    return updated;
  }

  async deleteProcedure(id: string): Promise<boolean> {
    if (!id) {
      throw new Error('Procedure ID is required');
    }

    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new Error('Procedure not found');
    }

    return await this.repository.delete(id);
  }

  async searchProcedures(
    organizationId: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<ProcedureRecord[]> {
    if (!organizationId) {
      throw new Error('Workspace ID is required');
    }

    return await this.repository.search(organizationId, query, options);
  }
}

export default ProcedureService;
