/**
 * ProceduralEntity - Core Entity for lore.dev procedures
 *
 * Represents executable procedures at different levels:
 * - guide: High-level instructional content
 * - project: Project-scoped workflows
 * - task: Individual executable tasks
 * - skill: Reusable skill definitions
 */

import type { Graph, GraphNode, GraphEdge } from '@kloudi/shared/types';

/**
 * Procedure levels
 */
export const ProcedureLevel = {
  GUIDE: 'guide',
  PROJECT: 'project',
  TASK: 'task',
  SKILL: 'skill',
} as const;

export type ProcedureLevelType =
  (typeof ProcedureLevel)[keyof typeof ProcedureLevel];

/**
 * Procedure maturity stages
 */
export const ProcedureMaturity = {
  DRAFT: 'draft',
  CURATED: 'curated',
  VALIDATED: 'validated',
} as const;

export type ProcedureMaturityType =
  (typeof ProcedureMaturity)[keyof typeof ProcedureMaturity];

/**
 * Interface for procedure entity constructor data
 */
export interface ProcedureEntityData {
  id?: string;
  slug: string;
  name: string;
  description?: string;
  level?: ProcedureLevelType;
  maturity?: ProcedureMaturityType;
  graph?: Graph;
  parameters?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  workspaceId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Validation result interface
 */
interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * ProceduralEntity
 * Pure business entity with no infrastructure dependencies
 */
export class ProceduralEntity {
  id: string | undefined;
  slug: string;
  name: string;
  description: string | undefined;
  level: ProcedureLevelType;
  maturity: ProcedureMaturityType;
  graph: Graph;
  parameters: Record<string, unknown>;
  constraints: Record<string, unknown>;
  workspaceId: string | undefined;
  createdAt: Date | undefined;
  updatedAt: Date | undefined;

  constructor({
    id,
    slug,
    name,
    description,
    level = ProcedureLevel.TASK,
    maturity = ProcedureMaturity.DRAFT,
    graph = { nodes: [], edges: [] },
    parameters = {},
    constraints = {},
    workspaceId,
    createdAt,
    updatedAt,
  }: ProcedureEntityData) {
    this.id = id;
    this.slug = slug;
    this.name = name;
    this.description = description;
    this.level = level;
    this.maturity = maturity;
    this.graph = graph;
    this.parameters = parameters;
    this.constraints = constraints;
    this.workspaceId = workspaceId;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  /**
   * Validate the procedure entity
   */
  validate(): ValidationResult {
    const errors: string[] = [];

    if (!this.slug || this.slug.trim().length === 0) {
      errors.push('Slug is required');
    }

    if (!this.name || this.name.trim().length === 0) {
      errors.push('Name is required');
    }

    if (
      !Object.values(ProcedureLevel).includes(
        this.level as (typeof ProcedureLevel)[keyof typeof ProcedureLevel]
      )
    ) {
      errors.push(`Invalid level: ${this.level}`);
    }

    if (
      !Object.values(ProcedureMaturity).includes(
        this.maturity as (typeof ProcedureMaturity)[keyof typeof ProcedureMaturity]
      )
    ) {
      errors.push(`Invalid maturity: ${this.maturity}`);
    }

    if (!this.graph || !Array.isArray(this.graph.nodes)) {
      errors.push('Graph must have nodes array');
    }

    if (!this.graph || !Array.isArray(this.graph.edges)) {
      errors.push('Graph must have edges array');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if procedure can be executed
   */
  canExecute(): boolean {
    // Must be validated or curated to execute
    if (this.maturity === ProcedureMaturity.DRAFT) {
      return false;
    }

    // Must have at least one node
    if (!this.graph.nodes || this.graph.nodes.length === 0) {
      return false;
    }

    return true;
  }

  /**
   * Get a node by ID from the graph
   */
  getNode(nodeId: string): GraphNode | null {
    if (!this.graph.nodes) return null;
    return this.graph.nodes.find((node) => node.id === nodeId) || null;
  }

  /**
   * Get the next nodes after a given node
   */
  getNextNodes(nodeId: string): GraphNode[] {
    if (!this.graph.edges || !this.graph.nodes) return [];

    const outgoingEdges = this.graph.edges.filter(
      (edge: GraphEdge) => edge.source === nodeId
    );
    const nextNodeIds = outgoingEdges.map((edge: GraphEdge) => edge.target);

    return this.graph.nodes.filter((node: GraphNode) =>
      nextNodeIds.includes(node.id)
    );
  }

  /**
   * Get entry nodes (nodes with no incoming edges)
   */
  getEntryNodes(): GraphNode[] {
    if (!this.graph.nodes || !this.graph.edges) return [];

    const nodesWithIncoming = new Set(
      this.graph.edges.map((edge: GraphEdge) => edge.target)
    );

    return this.graph.nodes.filter(
      (node: GraphNode) => !nodesWithIncoming.has(node.id)
    );
  }

  /**
   * Check if procedure can be promoted to next maturity level
   */
  canPromote(): boolean {
    if (this.maturity === ProcedureMaturity.VALIDATED) {
      return false; // Already at highest level
    }

    const validation = this.validate();
    return validation.valid;
  }
}

export default ProceduralEntity;
