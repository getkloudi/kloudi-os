/**
 * ProcedureRepository - Data Access Layer for ProceduralEntity
 *
 * Handles all database operations for procedures.
 */

import { Database } from '@kloudi/infrastructure/database';
import { Logger } from '@kloudi/shared/logger';
import type {
  ProcedureEntityData,
  ProcedureLevelType,
} from './procedure-entity.js';

const logger = Logger.getInstance('procedures');

/**
 * Database procedure record type
 */
export interface ProcedureRecord {
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
 * Prisma client interface for procedures
 */
interface PrismaClient {
  procedure: {
    create: (args: {
      data: {
        slug: string;
        name: string;
        description?: string;
        level?: string;
        maturity?: string;
        graph?: unknown;
        parameters?: unknown;
        constraints?: unknown;
        organizationId?: string;
      };
    }) => Promise<ProcedureRecord>;
    findUnique: (args: {
      where: { id: string };
    }) => Promise<ProcedureRecord | null>;
    findFirst: (args: {
      where: { organizationId?: string; slug?: string };
    }) => Promise<ProcedureRecord | null>;
    findMany: (args: {
      where?: {
        organizationId?: string;
        level?: string;
        OR?: Array<{
          name?: { contains: string; mode: string };
          description?: { contains: string; mode: string };
          slug?: { contains: string; mode: string };
        }>;
      };
      orderBy?: Array<{ createdAt?: string }>;
      take?: number;
      skip?: number;
    }) => Promise<ProcedureRecord[]>;
    update: (args: {
      where: { id: string };
      data: Partial<ProcedureEntityData> & { updatedAt?: Date };
    }) => Promise<ProcedureRecord>;
    delete: (args: { where: { id: string } }) => Promise<ProcedureRecord>;
  };
}

/**
 * Search options interface
 */
interface SearchOptions {
  limit?: number;
  offset?: number;
}

/**
 * ProcedureRepository - Data Access Layer
 */
export class ProcedureRepository {
  private prisma: PrismaClient | null;

  constructor(prisma: PrismaClient | null = null) {
    this.prisma = prisma;
  }

  async getClient(): Promise<PrismaClient> {
    if (this.prisma) return this.prisma;
    return (await Database.getInstance().getClient()) as unknown as PrismaClient;
  }

  async create(data: ProcedureEntityData): Promise<ProcedureRecord> {
    const db = await this.getClient();

    try {
      const createData: {
        slug: string;
        name: string;
        description?: string;
        level?: string;
        maturity?: string;
        graph?: unknown;
        parameters?: unknown;
        constraints?: unknown;
        organizationId?: string;
      } = {
        slug: data.slug,
        name: data.name,
        graph: data.graph || { nodes: [], edges: [] },
        parameters: data.parameters || {},
        constraints: data.constraints || {},
      };

      if (data.description !== undefined) {
        createData.description = data.description;
      }
      if (data.level !== undefined) {
        createData.level = data.level;
      }
      if (data.maturity !== undefined) {
        createData.maturity = data.maturity;
      }
      if (data.organizationId !== undefined) {
        createData.organizationId = data.organizationId;
      }

      const procedure = await db.procedure.create({
        data: createData,
      });

      logger.info(`Procedure created: ${procedure.id}`);
      return procedure;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to create procedure:', err);
      throw new Error(`Procedure creation failed: ${err.message}`);
    }
  }

  async findById(id: string): Promise<ProcedureRecord | null> {
    const db = await this.getClient();

    try {
      return await db.procedure.findUnique({
        where: { id },
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to find procedure ${id}:`, err);
      throw new Error(`Procedure lookup failed: ${err.message}`);
    }
  }

  async findBySlug(
    organizationId: string,
    slug: string
  ): Promise<ProcedureRecord | null> {
    const db = await this.getClient();

    try {
      return await db.procedure.findFirst({
        where: {
          organizationId,
          slug,
        },
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to find procedure by slug ${slug}:`, err);
      throw new Error(`Procedure lookup failed: ${err.message}`);
    }
  }

  async findByLevel(
    organizationId: string,
    level: ProcedureLevelType,
    options: SearchOptions = {}
  ): Promise<ProcedureRecord[]> {
    const db = await this.getClient();
    const { limit = 20, offset = 0 } = options;

    try {
      return await db.procedure.findMany({
        where: {
          organizationId,
          level,
        },
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
        skip: offset,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to find procedures by level ${level}:`, err);
      throw new Error(`Procedure search failed: ${err.message}`);
    }
  }

  async update(
    id: string,
    data: Partial<ProcedureEntityData>
  ): Promise<ProcedureRecord> {
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
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to update procedure ${id}:`, err);
      throw new Error(`Procedure update failed: ${err.message}`);
    }
  }

  async delete(id: string): Promise<boolean> {
    const db = await this.getClient();

    try {
      await db.procedure.delete({
        where: { id },
      });

      logger.info(`Procedure deleted: ${id}`);
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to delete procedure ${id}:`, err);
      throw new Error(`Procedure deletion failed: ${err.message}`);
    }
  }

  async search(
    organizationId: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<ProcedureRecord[]> {
    const db = await this.getClient();
    const { limit = 20, offset = 0 } = options;

    try {
      return await db.procedure.findMany({
        where: {
          organizationId,
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
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to search procedures:`, err);
      throw new Error(`Procedure search failed: ${err.message}`);
    }
  }
}

export default ProcedureRepository;
