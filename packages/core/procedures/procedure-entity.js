/**
 * ProceduralEntity - Core Entity for lore.dev procedures
 *
 * Represents executable procedures at different levels:
 * - guide: High-level instructional content
 * - project: Project-scoped workflows
 * - task: Individual executable tasks
 * - skill: Reusable skill definitions
 */

/**
 * Procedure levels
 */
export const ProcedureLevel = {
  GUIDE: 'guide',
  PROJECT: 'project',
  TASK: 'task',
  SKILL: 'skill',
};

/**
 * Procedure maturity stages
 */
export const ProcedureMaturity = {
  DRAFT: 'draft',
  CURATED: 'curated',
  VALIDATED: 'validated',
};

/**
 * ProceduralEntity
 * Pure business entity with no infrastructure dependencies
 */
export class ProceduralEntity {
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
  }) {
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
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate() {
    const errors = [];

    if (!this.slug || this.slug.trim().length === 0) {
      errors.push('Slug is required');
    }

    if (!this.name || this.name.trim().length === 0) {
      errors.push('Name is required');
    }

    if (!Object.values(ProcedureLevel).includes(this.level)) {
      errors.push(`Invalid level: ${this.level}`);
    }

    if (!Object.values(ProcedureMaturity).includes(this.maturity)) {
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
   * @returns {boolean}
   */
  canExecute() {
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
   * @param {string} nodeId
   * @returns {object|null}
   */
  getNode(nodeId) {
    if (!this.graph.nodes) return null;
    return this.graph.nodes.find((node) => node.id === nodeId) || null;
  }

  /**
   * Get the next nodes after a given node
   * @param {string} nodeId
   * @returns {object[]}
   */
  getNextNodes(nodeId) {
    if (!this.graph.edges || !this.graph.nodes) return [];

    const outgoingEdges = this.graph.edges.filter(
      (edge) => edge.source === nodeId
    );
    const nextNodeIds = outgoingEdges.map((edge) => edge.target);

    return this.graph.nodes.filter((node) => nextNodeIds.includes(node.id));
  }

  /**
   * Get entry nodes (nodes with no incoming edges)
   * @returns {object[]}
   */
  getEntryNodes() {
    if (!this.graph.nodes || !this.graph.edges) return [];

    const nodesWithIncoming = new Set(
      this.graph.edges.map((edge) => edge.target)
    );

    return this.graph.nodes.filter((node) => !nodesWithIncoming.has(node.id));
  }

  /**
   * Check if procedure can be promoted to next maturity level
   * @returns {boolean}
   */
  canPromote() {
    if (this.maturity === ProcedureMaturity.VALIDATED) {
      return false; // Already at highest level
    }

    const validation = this.validate();
    return validation.valid;
  }
}

export default ProceduralEntity;
