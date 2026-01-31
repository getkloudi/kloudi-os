/**
 * ProcedureRepository - Data Access Layer for ProceduralEntity
 *
 * Handles all database operations for procedures.
 */

import { Database } from '@kloudi/infrastructure/database';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('procedures');

/**
 * ProcedureRepository - Data Access Layer
 */
export class ProcedureRepository {
  constructor(prisma = null) {
    this.prisma = prisma;
  }

  async getClient() {
    if (this.prisma) return this.prisma;
    return await Database.getInstance().getClient();
  }

  async create(data) {
    const db = await this.getClient();

    try {
      const procedure = await db.procedure.create({
        data: {
          slug: data.slug,
          name: data.name,
          description: data.description,
          level: data.level,
          maturity: data.maturity,
          graph: data.graph || { nodes: [], edges: [] },
          parameters: data.parameters || {},
          constraints: data.constraints || {},
          workspaceId: data.workspaceId,
        },
      });

      logger.info(`Procedure created: ${procedure.id}`);
      return procedure;
    } catch (error) {
      logger.error('Failed to create procedure:', error);
      throw new Error(`Procedure creation failed: ${error.message}`);
    }
  }

  async findById(id) {
    const db = await this.getClient();

    try {
      return await db.procedure.findUnique({
        where: { id },
      });
    } catch (error) {
      logger.error(`Failed to find procedure ${id}:`, error);
      throw new Error(`Procedure lookup failed: ${error.message}`);
    }
  }

  async findBySlug(workspaceId, slug) {
    const db = await this.getClient();

    try {
      return await db.procedure.findFirst({
        where: {
          workspaceId,
          slug,
        },
      });
    } catch (error) {
      logger.error(`Failed to find procedure by slug ${slug}:`, error);
      throw new Error(`Procedure lookup failed: ${error.message}`);
    }
  }

  async findByLevel(workspaceId, level, options = {}) {
    const db = await this.getClient();
    const { limit = 20, offset = 0 } = options;

    try {
      return await db.procedure.findMany({
        where: {
          workspaceId,
          level,
        },
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
        skip: offset,
      });
    } catch (error) {
      logger.error(`Failed to find procedures by level ${level}:`, error);
      throw new Error(`Procedure search failed: ${error.message}`);
    }
  }

  async update(id, data) {
    const db = await this.getClient();

    try {
      const procedure = await db.procedure.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });

      logger.info(`Procedure updated: ${id}`);
      return procedure;
    } catch (error) {
      logger.error(`Failed to update procedure ${id}:`, error);
      throw new Error(`Procedure update failed: ${error.message}`);
    }
  }

  async delete(id) {
    const db = await this.getClient();

    try {
      await db.procedure.delete({
        where: { id },
      });

      logger.info(`Procedure deleted: ${id}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete procedure ${id}:`, error);
      throw new Error(`Procedure deletion failed: ${error.message}`);
    }
  }

  async search(workspaceId, query, options = {}) {
    const db = await this.getClient();
    const { limit = 20, offset = 0 } = options;

    try {
      return await db.procedure.findMany({
        where: {
          workspaceId,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { slug: { contains: query, mode: 'insensitive' } },
          ],
        },
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
        skip: offset,
      });
    } catch (error) {
      logger.error(`Failed to search procedures:`, error);
      throw new Error(`Procedure search failed: ${error.message}`);
    }
  }
}

export default ProcedureRepository;
