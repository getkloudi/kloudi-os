/**
 * SopRepository - Data Access Layer for SopEntity
 *
 * Handles all database operations for SOPs.
 */

import { Database } from '@kloudi-os/infrastructure/database';
import { Logger } from '@kloudi-os/shared/logger';
import type { SopEntityData, SopLevelType } from './sop-entity.js';

const logger = Logger.getInstance('sops');

/**
 * Database SOP record type
 */
export interface SopRecord {
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
 * Prisma client interface for SOPs
 */
interface PrismaClient {
  sop: {
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
    }) => Promise<SopRecord>;
    findUnique: (args: { where: { id: string } }) => Promise<SopRecord | null>;
    findFirst: (args: {
      where: { organizationId?: string; slug?: string };
    }) => Promise<SopRecord | null>;
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
    }) => Promise<SopRecord[]>;
    update: (args: {
      where: { id: string };
      data: Partial<SopEntityData> & { updatedAt?: Date };
    }) => Promise<SopRecord>;
    delete: (args: { where: { id: string } }) => Promise<SopRecord>;
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
 * SopRepository - Data Access Layer
 */
export class SopRepository {
  private prisma: PrismaClient | null;

  constructor(prisma: PrismaClient | null = null) {
    this.prisma = prisma;
  }

  async getClient(): Promise<PrismaClient> {
    if (this.prisma) return this.prisma;
    return (await Database.getInstance().getClient()) as unknown as PrismaClient;
  }

  async create(data: SopEntityData): Promise<SopRecord> {
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

      const record = await db.sop.create({
        data: createData,
      });

      logger.info(`SOP created: ${record.id}`);
      return record;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to create SOP:', err);
      throw new Error(`SOP creation failed: ${err.message}`);
    }
  }

  async findById(id: string): Promise<SopRecord | null> {
    const db = await this.getClient();

    try {
      return await db.sop.findUnique({
        where: { id },
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to find SOP ${id}:`, err);
      throw new Error(`SOP lookup failed: ${err.message}`);
    }
  }

  async findBySlug(
    organizationId: string,
    slug: string
  ): Promise<SopRecord | null> {
    const db = await this.getClient();

    try {
      return await db.sop.findFirst({
        where: {
          organizationId,
          slug,
        },
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to find SOP by slug ${slug}:`, err);
      throw new Error(`SOP lookup failed: ${err.message}`);
    }
  }

  async findByLevel(
    organizationId: string,
    level: SopLevelType,
    options: SearchOptions = {}
  ): Promise<SopRecord[]> {
    const db = await this.getClient();
    const { limit = 20, offset = 0 } = options;

    try {
      return await db.sop.findMany({
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
      logger.error(`Failed to find SOPs by level ${level}:`, err);
      throw new Error(`SOP search failed: ${err.message}`);
    }
  }

  async update(id: string, data: Partial<SopEntityData>): Promise<SopRecord> {
    const db = await this.getClient();

    try {
      const record = await db.sop.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });

      logger.info(`SOP updated: ${id}`);
      return record;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to update SOP ${id}:`, err);
      throw new Error(`SOP update failed: ${err.message}`);
    }
  }

  async delete(id: string): Promise<boolean> {
    const db = await this.getClient();

    try {
      await db.sop.delete({
        where: { id },
      });

      logger.info(`SOP deleted: ${id}`);
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to delete SOP ${id}:`, err);
      throw new Error(`SOP deletion failed: ${err.message}`);
    }
  }

  async search(
    organizationId: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<SopRecord[]> {
    const db = await this.getClient();
    const { limit = 20, offset = 0 } = options;

    try {
      return await db.sop.findMany({
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
      logger.error(`Failed to search SOPs:`, err);
      throw new Error(`SOP search failed: ${err.message}`);
    }
  }
}

export default SopRepository;
