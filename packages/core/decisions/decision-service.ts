/**
 * Decision Domain - Core Business Logic
 *
 * Implements clean architecture for decision management:
 * - Entities: Decision, DecisionSource, DecisionTag, DecisionOutcome
 * - Repositories: Data access abstraction
 * - Services: Business logic and use cases
 */

import { Database } from '@kloudi/infrastructure/database';
import { Logger } from '@kloudi/shared/logger';
// Import enums from compiled JS (interfaces are TypeScript-only)
import {
  DecisionStatus,
  Priority,
  OutcomeResult,
  ImpactLevel,
} from '@kloudi/shared/types';
import type { Decision } from '@kloudi/shared/types';

const logger = Logger.getInstance('decisions');

/**
 * Interface for Decision entity constructor data
 */
interface DecisionEntityData {
  id?: string;
  title: string;
  description: string;
  context?: string;
  outcome?: string;
  status?: DecisionStatus;
  priority?: Priority;
  authorId: string;
  projectId: string;
  sourceIds?: string[];
  tagIds?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Interface for user context
 */
interface UserContext {
  userId: string;
  organizationId?: string;
  role?: string;
}

/**
 * Interface for decision search options
 */
interface DecisionSearchOptions {
  status?: DecisionStatus;
  priority?: Priority;
  limit?: number;
  offset?: number;
}

/**
 * Interface for outcome data
 */
interface OutcomeData {
  result?: OutcomeResult;
  impact?: ImpactLevel;
  lessons?: string;
  metrics?: Record<string, number>;
}

/**
 * Prisma model methods interface for typed database access
 */
interface PrismaModelDelegate<T = unknown> {
  findMany: (args?: Record<string, unknown>) => Promise<T[]>;
  findUnique: (args: Record<string, unknown>) => Promise<T | null>;
  create: (args: Record<string, unknown>) => Promise<T>;
  update: (args: Record<string, unknown>) => Promise<T>;
}

/**
 * Typed database client interface for decision domain
 */
interface DecisionDbClient {
  decision: PrismaModelDelegate;
  decisionOutcome: PrismaModelDelegate;
}

/**
 * Decision Entity
 * Pure business entity with no infrastructure dependencies
 */
export class DecisionEntity {
  id: string | undefined;
  title: string;
  description: string;
  context: string | undefined;
  outcome: string | undefined;
  status: DecisionStatus;
  priority: Priority;
  authorId: string;
  projectId: string;
  sourceIds: string[];
  tagIds: string[];
  createdAt: Date | undefined;
  updatedAt: Date | undefined;

  constructor({
    id,
    title,
    description,
    context,
    outcome,
    status = DecisionStatus.DRAFT,
    priority = Priority.MEDIUM,
    authorId,
    projectId,
    sourceIds = [],
    tagIds = [],
    createdAt,
    updatedAt,
  }: DecisionEntityData) {
    this.id = id;
    this.title = title;
    this.description = description;
    this.context = context;
    this.outcome = outcome;
    this.status = status;
    this.priority = priority;
    this.authorId = authorId;
    this.projectId = projectId;
    this.sourceIds = sourceIds;
    this.tagIds = tagIds;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  // Business rules
  canBeTransitionedTo(newStatus: DecisionStatus): boolean {
    const validTransitions: Record<DecisionStatus, DecisionStatus[]> = {
      [DecisionStatus.DRAFT]: [
        DecisionStatus.PROPOSED,
        DecisionStatus.REJECTED,
      ],
      [DecisionStatus.PROPOSED]: [
        DecisionStatus.APPROVED,
        DecisionStatus.REJECTED,
      ],
      [DecisionStatus.APPROVED]: [DecisionStatus.IMPLEMENTED],
      [DecisionStatus.REJECTED]: [DecisionStatus.DRAFT],
      [DecisionStatus.IMPLEMENTED]: [],
    };

    return validTransitions[this.status]?.includes(newStatus) || false;
  }

  isHighImpact(): boolean {
    return [Priority.HIGH, Priority.CRITICAL].includes(this.priority);
  }

  requiresApproval(): boolean {
    return this.isHighImpact() || this.priority === Priority.CRITICAL;
  }
}

/**
 * Decision Repository - Data Access Layer
 */
export class DecisionRepository {
  static async create(decisionData: DecisionEntityData): Promise<Decision> {
    const db = (await Database.getInstance().getClient()) as unknown as DecisionDbClient;

    try {
      const decision = await db.decision.create({
        data: {
          ...decisionData,
          sources: decisionData.sourceIds
            ? {
                connect: decisionData.sourceIds.map((id: string) => ({ id })),
              }
            : undefined,
          tags: decisionData.tagIds
            ? {
                connect: decisionData.tagIds.map((id: string) => ({ id })),
              }
            : undefined,
        },
        include: {
          sources: true,
          tags: true,
          author: true,
          project: true,
        },
      });

      const result = decision as unknown as Decision;
      logger.info(`Decision created: ${result.id}`);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to create decision:', err);
      throw new Error(`Decision creation failed: ${err.message}`);
    }
  }

  static async findById(id: string): Promise<Decision | null> {
    const db = (await Database.getInstance().getClient()) as unknown as DecisionDbClient;

    try {
      const decision = await db.decision.findUnique({
        where: { id },
        include: {
          sources: true,
          tags: true,
          outcomes: true,
          author: true,
          project: true,
        },
      });
      return decision as unknown as Decision | null;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to find decision ${id}:`, err);
      throw new Error(`Decision lookup failed: ${err.message}`);
    }
  }

  static async findByProject(
    projectId: string,
    options: DecisionSearchOptions = {}
  ): Promise<Decision[]> {
    const db = (await Database.getInstance().getClient()) as unknown as DecisionDbClient;
    const { status, priority, limit = 20, offset = 0 } = options;

    try {
      const where: Record<string, unknown> = { projectId };
      if (status) where['status'] = status;
      if (priority) where['priority'] = priority;

      const decisions = await db.decision.findMany({
        where,
        include: {
          sources: true,
          tags: true,
          author: true,
          project: true,
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      });
      return decisions as unknown as Decision[];
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to find decisions for project ${projectId}:`, err);
      throw new Error(`Decision search failed: ${err.message}`);
    }
  }

  static async update(
    id: string,
    updateData: Partial<DecisionEntityData>
  ): Promise<Decision> {
    const db = (await Database.getInstance().getClient()) as unknown as DecisionDbClient;

    try {
      const decision = await db.decision.update({
        where: { id },
        data: {
          ...updateData,
          updatedAt: new Date(),
        },
        include: {
          sources: true,
          tags: true,
          author: true,
          project: true,
        },
      });

      logger.info(`Decision updated: ${id}`);
      return decision as unknown as Decision;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to update decision ${id}:`, err);
      throw new Error(`Decision update failed: ${err.message}`);
    }
  }

  static async search(
    query: string,
    options: DecisionSearchOptions = {}
  ): Promise<Decision[]> {
    const db = (await Database.getInstance().getClient()) as unknown as DecisionDbClient;
    const { limit = 20, offset = 0 } = options;

    try {
      const decisions = await db.decision.findMany({
        where: {
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { context: { contains: query, mode: 'insensitive' } },
          ],
        },
        include: {
          sources: true,
          tags: true,
          author: true,
          project: true,
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      });
      return decisions as unknown as Decision[];
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to search decisions:`, err);
      throw new Error(`Decision search failed: ${err.message}`);
    }
  }
}

/**
 * Decision Service - Business Logic Layer
 */
export class DecisionService {
  static async createDecision(
    decisionData: DecisionEntityData,
    _userContext: UserContext
  ): Promise<Decision> {
    // Business validation
    if (!decisionData.title || decisionData.title.trim().length === 0) {
      throw new Error('Decision title is required');
    }

    if (
      !decisionData.description ||
      decisionData.description.trim().length === 0
    ) {
      throw new Error('Decision description is required');
    }

    if (!decisionData.authorId || !decisionData.projectId) {
      throw new Error('Author and project are required');
    }

    // Create entity
    const decision = new DecisionEntity(decisionData);

    // Auto-approve based on business rules
    if (decision.priority === Priority.CRITICAL) {
      throw new Error('Critical decisions require manual proposal process');
    }

    return await DecisionRepository.create(decisionData);
  }

  static async proposeDecision(
    id: string,
    _userContext: UserContext
  ): Promise<Decision> {
    const decision = await DecisionRepository.findById(id);
    if (!decision) {
      throw new Error('Decision not found');
    }

    const entity = new DecisionEntity(decision);

    if (!entity.canBeTransitionedTo(DecisionStatus.PROPOSED)) {
      throw new Error('Decision cannot be proposed in current status');
    }

    return await DecisionRepository.update(id, {
      status: DecisionStatus.PROPOSED,
    });
  }

  static async approveDecision(
    id: string,
    _userContext: UserContext
  ): Promise<Decision> {
    const decision = await DecisionRepository.findById(id);
    if (!decision) {
      throw new Error('Decision not found');
    }

    const entity = new DecisionEntity(decision);

    if (!entity.canBeTransitionedTo(DecisionStatus.APPROVED)) {
      throw new Error('Decision cannot be approved in current status');
    }

    return await DecisionRepository.update(id, {
      status: DecisionStatus.APPROVED,
    });
  }

  static async implementDecision(
    id: string,
    outcomeData: OutcomeData,
    _userContext: UserContext
  ): Promise<Decision> {
    const decision = await DecisionRepository.findById(id);
    if (!decision) {
      throw new Error('Decision not found');
    }

    const entity = new DecisionEntity(decision);

    if (!entity.canBeTransitionedTo(DecisionStatus.IMPLEMENTED)) {
      throw new Error('Decision cannot be implemented in current status');
    }

    // Create outcome record
    const outcome = await Database.getInstance().withTransaction(
      async (txClient) => {
        const tx = txClient as unknown as DecisionDbClient;
        const updateData: {
          status: DecisionStatus;
          outcome?: OutcomeResult | undefined;
          updatedAt: Date;
        } = {
          status: DecisionStatus.IMPLEMENTED,
          updatedAt: new Date(),
        };
        if (outcomeData.result !== undefined) {
          updateData.outcome = outcomeData.result;
        }

        const updatedDecision = await tx.decision.update({
          where: { id },
          data: updateData,
        });

        if (outcomeData.impact || outcomeData.lessons) {
          const outcomeCreateData: {
            decisionId: string;
            result: OutcomeResult;
            impact: ImpactLevel;
            lessons?: string | undefined;
            metrics: Record<string, number>;
          } = {
            decisionId: id,
            result: outcomeData.result || OutcomeResult.SUCCESS,
            impact: outcomeData.impact || ImpactLevel.MEDIUM,
            metrics: outcomeData.metrics || {},
          };
          if (outcomeData.lessons !== undefined) {
            outcomeCreateData.lessons = outcomeData.lessons;
          }
          await tx.decisionOutcome.create({
            data: outcomeCreateData,
          });
        }

        return updatedDecision as unknown as Decision;
      }
    );

    logger.info(`Decision implemented: ${id}`);
    return outcome;
  }

  static async getDecisionsByProject(
    projectId: string,
    filters: DecisionSearchOptions = {},
    _userContext: UserContext
  ): Promise<Decision[]> {
    return await DecisionRepository.findByProject(projectId, filters);
  }

  static async searchDecisions(
    query: string,
    options: DecisionSearchOptions = {},
    _userContext: UserContext
  ): Promise<Decision[]> {
    return await DecisionRepository.search(query, options);
  }
}

export default DecisionService;
