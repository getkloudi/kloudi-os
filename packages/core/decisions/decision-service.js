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
  SourceType,
  OutcomeResult,
  ImpactLevel,
} from '@kloudi/shared/types';

const logger = Logger.getInstance('decisions');

/**
 * Decision Entity
 * Pure business entity with no infrastructure dependencies
 */
export class DecisionEntity {
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
  }) {
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
  canBeTransitionedTo(newStatus) {
    const validTransitions = {
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

  isHighImpact() {
    return [Priority.HIGH, Priority.CRITICAL].includes(this.priority);
  }

  requiresApproval() {
    return this.isHighImpact() || this.priority === Priority.CRITICAL;
  }
}

/**
 * Decision Repository - Data Access Layer
 */
export class DecisionRepository {
  static async create(decisionData) {
    const db = await Database.getInstance().getClient();

    try {
      const decision = await db.decision.create({
        data: {
          ...decisionData,
          sources: decisionData.sourceIds
            ? {
                connect: decisionData.sourceIds.map((id) => ({ id })),
              }
            : undefined,
          tags: decisionData.tagIds
            ? {
                connect: decisionData.tagIds.map((id) => ({ id })),
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

      logger.info(`Decision created: ${decision.id}`);
      return decision;
    } catch (error) {
      logger.error('Failed to create decision:', error);
      throw new Error(`Decision creation failed: ${error.message}`);
    }
  }

  static async findById(id) {
    const db = await Database.getInstance().getClient();

    try {
      return await db.decision.findUnique({
        where: { id },
        include: {
          sources: true,
          tags: true,
          outcomes: true,
          author: true,
          project: true,
        },
      });
    } catch (error) {
      logger.error(`Failed to find decision ${id}:`, error);
      throw new Error(`Decision lookup failed: ${error.message}`);
    }
  }

  static async findByProject(projectId, options = {}) {
    const db = await Database.getInstance().getClient();
    const { status, priority, limit = 20, offset = 0 } = options;

    try {
      const where = { projectId };
      if (status) where.status = status;
      if (priority) where.priority = priority;

      return await db.decision.findMany({
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
    } catch (error) {
      logger.error(`Failed to find decisions for project ${projectId}:`, error);
      throw new Error(`Decision search failed: ${error.message}`);
    }
  }

  static async update(id, updateData) {
    const db = await Database.getInstance().getClient();

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
      return decision;
    } catch (error) {
      logger.error(`Failed to update decision ${id}:`, error);
      throw new Error(`Decision update failed: ${error.message}`);
    }
  }

  static async search(query, options = {}) {
    const db = await Database.getInstance().getClient();
    const { limit = 20, offset = 0 } = options;

    try {
      return await db.decision.findMany({
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
    } catch (error) {
      logger.error(`Failed to search decisions:`, error);
      throw new Error(`Decision search failed: ${error.message}`);
    }
  }
}

/**
 * Decision Service - Business Logic Layer
 */
export class DecisionService {
  static async createDecision(decisionData, userContext) {
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

  static async proposeDecision(id, userContext) {
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

  static async approveDecision(id, userContext) {
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

  static async implementDecision(id, outcomeData, userContext) {
    const decision = await DecisionRepository.findById(id);
    if (!decision) {
      throw new Error('Decision not found');
    }

    const entity = new DecisionEntity(decision);

    if (!entity.canBeTransitionedTo(DecisionStatus.IMPLEMENTED)) {
      throw new Error('Decision cannot be implemented in current status');
    }

    // Create outcome record
    const outcome = await Database.getInstance().withTransaction(async (tx) => {
      const updatedDecision = await tx.decision.update({
        where: { id },
        data: {
          status: DecisionStatus.IMPLEMENTED,
          outcome: outcomeData.result,
          updatedAt: new Date(),
        },
      });

      if (outcomeData.impact || outcomeData.lessons) {
        await tx.decisionOutcome.create({
          data: {
            decisionId: id,
            result: outcomeData.result || OutcomeResult.SUCCESS,
            impact: outcomeData.impact || ImpactLevel.MEDIUM,
            lessons: outcomeData.lessons,
            metrics: outcomeData.metrics || {},
          },
        });
      }

      return updatedDecision;
    });

    logger.info(`Decision implemented: ${id}`);
    return outcome;
  }

  static async getDecisionsByProject(projectId, filters = {}, userContext) {
    return await DecisionRepository.findByProject(projectId, filters);
  }

  static async searchDecisions(query, options = {}, userContext) {
    return await DecisionRepository.search(query, options);
  }
}

export default DecisionService;
