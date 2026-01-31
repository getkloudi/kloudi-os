/**
 * Agent Runtime - Core execution engine for SOPs
 *
 * Implements the SOP graph execution with:
 * - Graph traversal
 * - Node execution by type
 * - Context management
 * - Execution tracking in database
 */

import { Logger } from '@kloudi/shared/logger';
import { ContextManager, ContextPriority } from './context.js';
import { NodeExecutor } from './executor.js';

const logger = Logger.getInstance('agent-runtime');

/**
 * Execution status enum
 */
export const ExecutionStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

/**
 * AgentRuntime - SOP execution engine
 *
 * Features:
 * - Graph-based SOP execution
 * - Multiple node type support
 * - Context management
 * - Execution persistence
 *
 * @class
 */
export class AgentRuntime {
  /**
   * @param {Object} options
   * @param {Object} options.toolRegistry - Tool registry for tool_call nodes
   * @param {Object} options.aiClient - AI client for LLM operations
   * @param {Object} [options.db] - Database client for execution tracking
   * @param {number} [options.maxContextTokens=100000] - Max context tokens
   */
  constructor({ toolRegistry, aiClient, db = null, maxContextTokens = 100000 }) {
    if (!toolRegistry) {
      throw new Error('AgentRuntime requires a toolRegistry');
    }
    if (!aiClient) {
      throw new Error('AgentRuntime requires an aiClient');
    }

    this.toolRegistry = toolRegistry;
    this.aiClient = aiClient;
    this.db = db;
    this.maxContextTokens = maxContextTokens;
    this.nodeExecutor = new NodeExecutor();

    // Entity cache for sub-entity lookups
    this.entityCache = new Map();
  }

  /**
   * Execute an SOP entity
   *
   * @param {Object} entity - The SOP entity to execute
   * @param {string} entity.id - Entity identifier
   * @param {string} entity.name - Entity name
   * @param {Object} entity.graph - The execution graph
   * @param {Array} entity.graph.nodes - Graph nodes
   * @param {Array} entity.graph.edges - Graph edges
   * @param {string} [entity.graph.startNode] - Starting node id
   * @param {Object} [params={}] - Execution parameters (initial variables)
   * @returns {Promise<Object>} Execution result
   */
  async execute(entity, params = {}) {
    const { id: entityId, name: entityName, graph } = entity;

    if (!graph || !graph.nodes || graph.nodes.length === 0) {
      throw new Error('Entity must have a graph with nodes');
    }

    const executionId = this.generateExecutionId();
    const startTime = Date.now();

    logger.info(`Starting SOP execution: ${entityName}`, {
      entityId,
      executionId,
      paramKeys: Object.keys(params),
    });

    // Create execution record
    let executionRecord = null;
    if (this.db) {
      executionRecord = await this.createExecutionRecord(executionId, entity, params);
    }

    // Initialize context manager
    const contextManager = new ContextManager({ maxTokens: this.maxContextTokens });

    // Add system context
    if (entity.systemPrompt) {
      contextManager.add({
        id: 'system-prompt',
        type: 'system',
        content: entity.systemPrompt,
        priority: ContextPriority.SYSTEM,
      });
    }

    // Add entity instructions
    if (entity.description) {
      contextManager.add({
        id: 'entity-description',
        type: 'instruction',
        content: `Current procedure: ${entityName}\n${entity.description}`,
        priority: ContextPriority.INSTRUCTION,
      });
    }

    // Build execution state
    const executionState = {
      entityId,
      entityName,
      executionId,
      params,
      variables: { ...params },
      nodeResults: new Map(),
      visitedNodes: new Set(),
      currentNode: null,
      status: ExecutionStatus.RUNNING,
      startTime,
    };

    try {
      // Find starting node
      const startNodeId = graph.startNode || this.findStartNode(graph);
      if (!startNodeId) {
        throw new Error('Cannot determine starting node');
      }

      // Build adjacency list for graph traversal
      const adjacencyList = this.buildAdjacencyList(graph);

      // Execute the graph
      const output = await this.executeGraph(
        graph,
        adjacencyList,
        startNodeId,
        executionState,
        contextManager
      );

      // Execution completed successfully
      executionState.status = ExecutionStatus.COMPLETED;
      const duration = Date.now() - startTime;

      logger.info(`SOP execution completed: ${entityName}`, {
        executionId,
        duration,
        nodesExecuted: executionState.visitedNodes.size,
      });

      // Update execution record
      if (this.db && executionRecord) {
        await this.updateExecutionRecord(executionId, {
          status: ExecutionStatus.COMPLETED,
          output,
          duration,
          nodeCount: executionState.visitedNodes.size,
        });
      }

      return {
        success: true,
        executionId,
        entityId,
        entityName,
        output,
        variables: executionState.variables,
        nodeResults: Object.fromEntries(executionState.nodeResults),
        duration,
        status: ExecutionStatus.COMPLETED,
      };
    } catch (error) {
      executionState.status = ExecutionStatus.FAILED;
      const duration = Date.now() - startTime;

      logger.error(`SOP execution failed: ${entityName}`, error, {
        executionId,
        duration,
        lastNode: executionState.currentNode,
      });

      // Update execution record
      if (this.db && executionRecord) {
        await this.updateExecutionRecord(executionId, {
          status: ExecutionStatus.FAILED,
          error: error.message,
          duration,
          lastNode: executionState.currentNode,
        });
      }

      return {
        success: false,
        executionId,
        entityId,
        entityName,
        error: error.message,
        variables: executionState.variables,
        nodeResults: Object.fromEntries(executionState.nodeResults),
        duration,
        status: ExecutionStatus.FAILED,
        lastNode: executionState.currentNode,
      };
    }
  }

  /**
   * Execute the graph starting from a node
   *
   * @param {Object} graph - The graph
   * @param {Map} adjacencyList - Adjacency list
   * @param {string} nodeId - Current node id
   * @param {Object} state - Execution state
   * @param {ContextManager} contextManager - Context manager
   * @returns {Promise<*>} Output from execution
   */
  async executeGraph(graph, adjacencyList, nodeId, state, contextManager) {
    // Check for cycles
    if (state.visitedNodes.has(nodeId)) {
      logger.warn(`Cycle detected at node: ${nodeId}`);
      return state.nodeResults.get(nodeId)?.output;
    }

    // Find the node
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    state.currentNode = nodeId;
    state.visitedNodes.add(nodeId);

    logger.debug(`Executing node: ${nodeId}`, { type: node.type });

    // Execute the node based on type
    const result = await this.executeNode(node, state, contextManager);

    // Store result
    state.nodeResults.set(nodeId, result);

    // Update variables with output
    if (result.success && result.output !== undefined) {
      // Use node's outputVariable if specified, otherwise use node id
      const outputVar = node.outputVariable || nodeId;
      state.variables[outputVar] = result.output;

      // Add result to context
      contextManager.add({
        id: `result-${nodeId}`,
        type: 'result',
        content: `Result from ${node.name || nodeId}: ${
          typeof result.output === 'object'
            ? JSON.stringify(result.output, null, 2)
            : result.output
        }`,
        priority: ContextPriority.RESULT,
      });
    }

    // Check if execution should stop
    if (!result.success && node.stopOnError !== false) {
      throw new Error(`Node ${nodeId} failed: ${result.error}`);
    }

    // Determine next node(s)
    let nextNodeId = null;

    // Handle interpolative nodes specially (path selection)
    if (node.type === 'interpolative' && result.success) {
      const chosenPath = result.chosenPath;
      if (chosenPath && chosenPath.targetNode) {
        nextNodeId = chosenPath.targetNode;
      }
    } else {
      // Get next nodes from adjacency list
      const nextNodes = adjacencyList.get(nodeId) || [];
      if (nextNodes.length > 0) {
        // For now, take the first edge (linear execution)
        // Could be extended for parallel execution
        nextNodeId = nextNodes[0];
      }
    }

    // Continue to next node
    if (nextNodeId) {
      return await this.executeGraph(
        graph,
        adjacencyList,
        nextNodeId,
        state,
        contextManager
      );
    }

    // No more nodes - return last output
    return result.output;
  }

  /**
   * Execute a single node
   *
   * @param {Object} node - Node to execute
   * @param {Object} state - Execution state
   * @param {ContextManager} contextManager - Context manager
   * @returns {Promise<Object>} Node execution result
   */
  async executeNode(node, state, contextManager) {
    const context = {
      assembled: contextManager.assemble(),
      variables: state.variables,
    };

    switch (node.type) {
      case 'llm_generate':
        return await this.nodeExecutor.executeLLM(node, context, this.aiClient);

      case 'tool_call':
        return await this.nodeExecutor.executeTool(node, context, this.toolRegistry);

      case 'sub_entity':
        return await this.nodeExecutor.executeSubEntity(node, context, this);

      case 'interpolative':
        return await this.nodeExecutor.executeInterpolative(node, context, this.aiClient);

      case 'start':
        // Start node - just pass through
        return {
          success: true,
          nodeId: node.id,
          nodeType: 'start',
          output: state.params,
        };

      case 'end':
        // End node - return final output
        return {
          success: true,
          nodeId: node.id,
          nodeType: 'end',
          output: node.outputVariable ? state.variables[node.outputVariable] : state.variables,
        };

      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  /**
   * Load an entity by ID (for sub_entity nodes)
   *
   * @param {string} entityId - Entity ID to load
   * @returns {Promise<Object|null>} The entity or null
   */
  async loadEntity(entityId) {
    // Check cache first
    if (this.entityCache.has(entityId)) {
      return this.entityCache.get(entityId);
    }

    // Try to load from database
    if (this.db) {
      try {
        const entity = await this.db.entities?.findUnique({
          where: { id: entityId },
        });
        if (entity) {
          this.entityCache.set(entityId, entity);
          return entity;
        }
      } catch (error) {
        logger.error(`Failed to load entity: ${entityId}`, error);
      }
    }

    return null;
  }

  /**
   * Register an entity in the cache (for testing or pre-loading)
   *
   * @param {Object} entity - Entity to register
   */
  registerEntity(entity) {
    if (entity && entity.id) {
      this.entityCache.set(entity.id, entity);
    }
  }

  /**
   * Find the start node in a graph
   *
   * @param {Object} graph - The graph
   * @returns {string|null} Start node id or null
   */
  findStartNode(graph) {
    // Look for explicit start node
    const startNode = graph.nodes.find((n) => n.type === 'start');
    if (startNode) return startNode.id;

    // Look for node with no incoming edges
    const targetNodes = new Set(graph.edges?.map((e) => e.target) || []);
    const sourceOnlyNode = graph.nodes.find((n) => !targetNodes.has(n.id));
    if (sourceOnlyNode) return sourceOnlyNode.id;

    // Fall back to first node
    return graph.nodes[0]?.id || null;
  }

  /**
   * Build adjacency list from graph edges
   *
   * @param {Object} graph - The graph
   * @returns {Map} Adjacency list (nodeId -> [targetNodeIds])
   */
  buildAdjacencyList(graph) {
    const adjacencyList = new Map();

    for (const edge of graph.edges || []) {
      const { source, target } = edge;
      if (!adjacencyList.has(source)) {
        adjacencyList.set(source, []);
      }
      adjacencyList.get(source).push(target);
    }

    return adjacencyList;
  }

  /**
   * Generate unique execution ID
   *
   * @returns {string} Execution ID
   */
  generateExecutionId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `exec_${timestamp}_${random}`;
  }

  /**
   * Create execution record in database
   *
   * @param {string} executionId - Execution ID
   * @param {Object} entity - Entity being executed
   * @param {Object} params - Execution parameters
   * @returns {Promise<Object>} Created record
   */
  async createExecutionRecord(executionId, entity, params) {
    if (!this.db) return null;

    try {
      const record = await this.db.executions?.create({
        data: {
          id: executionId,
          entityId: entity.id,
          entityName: entity.name,
          status: ExecutionStatus.RUNNING,
          params: JSON.stringify(params),
          startedAt: new Date(),
        },
      });
      return record;
    } catch (error) {
      logger.error('Failed to create execution record', error);
      return null;
    }
  }

  /**
   * Update execution record in database
   *
   * @param {string} executionId - Execution ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated record
   */
  async updateExecutionRecord(executionId, updates) {
    if (!this.db) return null;

    try {
      const record = await this.db.executions?.update({
        where: { id: executionId },
        data: {
          ...updates,
          output: updates.output ? JSON.stringify(updates.output) : undefined,
          completedAt: new Date(),
        },
      });
      return record;
    } catch (error) {
      logger.error('Failed to update execution record', error);
      return null;
    }
  }
}

export default AgentRuntime;
