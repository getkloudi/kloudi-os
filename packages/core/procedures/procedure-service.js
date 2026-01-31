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
import { ProcedureRepository } from './procedure-repository.js';

const logger = Logger.getInstance('procedures');

/**
 * ProcedureService - Business Logic Layer
 */
export class ProcedureService {
  constructor(repository = null) {
    this.repository = repository || new ProcedureRepository();
  }

  async createProcedure(workspaceId, data) {
    // Business validation
    if (!data.slug || data.slug.trim().length === 0) {
      throw new Error('Procedure slug is required');
    }

    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Procedure name is required');
    }

    if (!workspaceId) {
      throw new Error('Workspace ID is required');
    }

    // Validate level
    if (data.level && !Object.values(ProcedureLevel).includes(data.level)) {
      throw new Error(`Invalid level: ${data.level}`);
    }

    // Check for duplicate slug
    const existing = await this.repository.findBySlug(workspaceId, data.slug);
    if (existing) {
      throw new Error(`Procedure with slug "${data.slug}" already exists`);
    }

    // Create entity for validation
    const entity = new ProceduralEntity({
      ...data,
      workspaceId,
      maturity: ProcedureMaturity.DRAFT, // Always start as draft
    });

    const validation = entity.validate();
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    return await this.repository.create({
      ...data,
      workspaceId,
      maturity: ProcedureMaturity.DRAFT,
    });
  }

  async getProcedure(workspaceId, slug) {
    if (!workspaceId || !slug) {
      throw new Error('Workspace ID and slug are required');
    }

    const procedure = await this.repository.findBySlug(workspaceId, slug);
    if (!procedure) {
      throw new Error(`Procedure not found: ${slug}`);
    }

    return procedure;
  }

  async listProcedures(workspaceId, options = {}) {
    if (!workspaceId) {
      throw new Error('Workspace ID is required');
    }

    const { level, maturity, limit = 20, offset = 0 } = options;

    if (level) {
      return await this.repository.findByLevel(workspaceId, level, {
        limit,
        offset,
      });
    }

    // If no level filter, search all
    return await this.repository.search(workspaceId, '', { limit, offset });
  }

  async updateProcedure(id, data) {
    if (!id) {
      throw new Error('Procedure ID is required');
    }

    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new Error('Procedure not found');
    }

    // Don't allow changing workspaceId
    delete data.workspaceId;

    // Create entity with merged data for validation
    const entity = new ProceduralEntity({
      ...existing,
      ...data,
    });

    const validation = entity.validate();
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    return await this.repository.update(id, data);
  }

  async promoteProcedure(id) {
    if (!id) {
      throw new Error('Procedure ID is required');
    }

    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new Error('Procedure not found');
    }

    const entity = new ProceduralEntity(existing);

    if (!entity.canPromote()) {
      throw new Error('Procedure cannot be promoted');
    }

    // Determine next maturity level
    let newMaturity;
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

  async deleteProcedure(id) {
    if (!id) {
      throw new Error('Procedure ID is required');
    }

    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new Error('Procedure not found');
    }

    return await this.repository.delete(id);
  }

  async searchProcedures(workspaceId, query, options = {}) {
    if (!workspaceId) {
      throw new Error('Workspace ID is required');
    }

    return await this.repository.search(workspaceId, query, options);
  }
}

export default ProcedureService;
