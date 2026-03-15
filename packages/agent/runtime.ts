/**
 * Agent Runtime - Core execution engine for SOPs
 *
 * Implements the SOP graph execution with:
 * - Graph traversal
 * - Node execution by type
 * - Context management
 * - Execution tracking in database
 */

import type {
  Graph,
  GraphNode,
  ProcedureEntity,
  ExecutionState,
  ExecutionResult,
  NodeResult,
  LoggerInstance,
  AIMessage,
  AIGenerateOptions,
  InterpolativePath,
} from '@kloudi/shared/types';
import { Logger } from '@kloudi/shared/logger';
import { ContextManager, ContextPriority } from './context.js';
import { NodeExecutor } from './executor.js';

const logger: LoggerInstance = Logger.getInstance('agent-runtime');

/**
 * Execution status enum
 */
export const ExecutionStatus: Record<string, string> = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

/**
 * AI client interface for LLM operations
 */
interface AIClient {
  generateText(
    messages: AIMessage[],
    options?: AIGenerateOptions
  ): Promise<{ text: string; usage?: Record<string, number> }>;
}

/**
 * Tool registry interface
 */
interface ToolRegistry {
  has(toolName: string): boolean;
  execute(toolName: string, params: Record<string, unknown>): Promise<unknown>;
}

/**
 * Database interface for execution tracking
 */
interface DatabaseClient {
  entities?: {
    findUnique(args: { where: { id: string } }): Promise<ProcedureEntity | null>;
  };
  executions?: {
    create(args: { data: ExecutionRecordData }): Promise<ExecutionRecord>;
    update(args: { where: { id: string }; data: ExecutionUpdateData }): Promise<ExecutionRecord>;
  };
}

/**
 * Execution record data for creation
 */
interface ExecutionRecordData {
  id: string;
  entityId: string;
  entityName: string;
  status: string;
  params: string;
  startedAt: Date;
}

/**
 * Execution update data
 */
interface ExecutionUpdateData {
  status?: string;
  output?: unknown;
  error?: string;
  duration?: number;
  lastNode?: string | null;
  nodeCount?: number;
  completedAt?: Date;
}

/**
 * Execution record from database
 */
interface ExecutionRecord {
  id: string;
  entityId: string;
  entityName: string;
  status: string;
  params: string;
  startedAt: Date;
  completedAt?: Date;
}

/**
 * Constructor options for AgentRuntime
 */
interface AgentRuntimeOptions {
  toolRegistry: ToolRegistry;
  aiClient: AIClient;
  db?: DatabaseClient | null;
  maxContextTokens?: number;
}

/**
 * Extended node result with chosenPath for interpolative nodes
 */
interface InterpolativeNodeResult extends NodeResult {
  chosenPath?: InterpolativePath & { targetNode?: string };
}

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
  private toolRegistry: ToolRegistry;
  private aiClient: AIClient;
  private db: DatabaseClient | null;
  private maxContextTokens: number;
  private nodeExecutor: NodeExecutor;
  private entityCache: Map<string, ProcedureEntity>;

  constructor({ toolRegistry, aiClient, db = null, maxContextTokens = 100000 }: AgentRuntimeOptions) {
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
    this.entityCache = new Map<string, ProcedureEntity>();
  }

  /**
   * Execute an SOP entity
   */
  async execute(
    entity: ProcedureEntity,
    params: Record<string, unknown> = {}
  ): Promise<ExecutionResult> {
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
    let executionRecord: ExecutionRecord | null = null;
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
        priority: ContextPriority['SYSTEM'] ?? 100,
      });
    }

    // Add entity instructions
    if (entity.description) {
      contextManager.add({
        id: 'entity-description',
        type: 'instruction',
        content: `Current procedure: ${entityName}\n${entity.description}`,
        priority: ContextPriority['INSTRUCTION'] ?? 80,
      });
    }

    // Build execution state
    const executionState: ExecutionState = {
      entityId,
      entityName,
      executionId,
      params,
      variables: { ...params },
      nodeResults: new Map<string, NodeResult>(),
      visitedNodes: new Set<string>(),
      currentNode: null,
      status: ExecutionStatus['RUNNING'] ?? 'running',
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
      executionState.status = ExecutionStatus['COMPLETED'] ?? 'completed';
      const duration = Date.now() - startTime;

      logger.info(`SOP execution completed: ${entityName}`, {
        executionId,
        duration,
        nodesExecuted: executionState.visitedNodes.size,
      });

      // Update execution record
      if (this.db && executionRecord) {
        await this.updateExecutionRecord(executionId, {
          status: ExecutionStatus['COMPLETED'] ?? 'completed',
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
        status: ExecutionStatus['COMPLETED'] ?? 'completed',
      };
    } catch (error) {
      executionState.status = ExecutionStatus['FAILED'] ?? 'failed';
      const duration = Date.now() - startTime;

      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(`SOP execution failed: ${entityName}`, error, {
        executionId,
        duration,
        lastNode: executionState.currentNode,
      });

      // Update execution record
      if (this.db && executionRecord) {
        await this.updateExecutionRecord(executionId, {
          status: ExecutionStatus['FAILED'] ?? 'failed',
          error: errorMessage,
          duration,
          lastNode: executionState.currentNode,
        });
      }

      const result: ExecutionResult = {
        success: false,
        executionId,
        entityId,
        entityName,
        error: errorMessage,
        variables: executionState.variables,
        nodeResults: Object.fromEntries(executionState.nodeResults),
        duration,
        status: ExecutionStatus['FAILED'] ?? 'failed',
      };
      if (executionState.currentNode !== null) {
        result.lastNode = executionState.currentNode;
      }
      return result;
    }
  }

  /**
   * Execute the graph starting from a node
   */
  async executeGraph(
    graph: Graph,
    adjacencyList: Map<string, string[]>,
    nodeId: string,
    state: ExecutionState,
    contextManager: ContextManager
  ): Promise<unknown> {
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
        content: `Result from ${node.name ?? nodeId}: ${
          typeof result.output === 'object'
            ? JSON.stringify(result.output, null, 2)
            : String(result.output)
        }`,
        priority: ContextPriority['RESULT'] ?? 60,
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
      const interpolativeResult = result as InterpolativeNodeResult;
      const chosenPath = interpolativeResult.chosenPath;
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
   */
  async executeNode(
    node: GraphNode,
    state: ExecutionState,
    contextManager: ContextManager
  ): Promise<NodeResult> {
    const context: { assembled: string; variables: Record<string, unknown> } = {
      assembled: contextManager.assemble(),
      variables: state.variables,
    };

    switch (node.type) {
      case 'llm_generate':
        return await this.nodeExecutor.executeLLM(
          node as GraphNode & { config?: AIGenerateOptions },
          context,
          this.aiClient
        );

      case 'tool_call':
        return await this.nodeExecutor.executeTool(
          node as GraphNode & { tool: string; params?: Record<string, unknown> },
          context,
          this.toolRegistry
        );

      case 'sub_entity':
        return await this.nodeExecutor.executeSubEntity(
          node as GraphNode & { entityId: string; params?: Record<string, unknown> },
          context,
          this
        );

      case 'interpolative':
        return await this.nodeExecutor.executeInterpolative(
          node as GraphNode & { question: string; paths: InterpolativePath[] },
          context,
          this.aiClient
        );

      case 'start':
        // Start node - just pass through
        return {
          success: true,
          nodeId: node.id,
          nodeType: 'start',
          output: state.params,
        };

      case 'end': {
        // End node - return final output
        const outputVar = node.outputVariable;
        return {
          success: true,
          nodeId: node.id,
          nodeType: 'end',
          output: outputVar ? state.variables[outputVar] : state.variables,
        };
      }

      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  /**
   * Load an entity by ID (for sub_entity nodes)
   */
  async loadEntity(entityId: string): Promise<ProcedureEntity | null> {
    // Check cache first
    if (this.entityCache.has(entityId)) {
      return this.entityCache.get(entityId) ?? null;
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
   */
  registerEntity(entity: ProcedureEntity): void {
    if (entity && entity.id) {
      this.entityCache.set(entity.id, entity);
    }
  }

  /**
   * Find the start node in a graph
   */
  findStartNode(graph: Graph): string | null {
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
   */
  buildAdjacencyList(graph: Graph): Map<string, string[]> {
    const adjacencyList = new Map<string, string[]>();

    for (const edge of graph.edges || []) {
      const { source, target } = edge;
      if (!adjacencyList.has(source)) {
        adjacencyList.set(source, []);
      }
      const targets = adjacencyList.get(source);
      if (targets) {
        targets.push(target);
      }
    }

    return adjacencyList;
  }

  /**
   * Generate unique execution ID
   */
  generateExecutionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `exec_${timestamp}_${random}`;
  }

  /**
   * Create execution record in database
   */
  async createExecutionRecord(
    executionId: string,
    entity: ProcedureEntity,
    params: Record<string, unknown>
  ): Promise<ExecutionRecord | null> {
    if (!this.db) return null;

    try {
      const record = await this.db.executions?.create({
        data: {
          id: executionId,
          entityId: entity.id,
          entityName: entity.name,
          status: ExecutionStatus['RUNNING'] ?? 'running',
          params: JSON.stringify(params),
          startedAt: new Date(),
        },
      });
      return record ?? null;
    } catch (error) {
      logger.error('Failed to create execution record', error);
      return null;
    }
  }

  /**
   * Update execution record in database
   */
  async updateExecutionRecord(
    executionId: string,
    updates: ExecutionUpdateData
  ): Promise<ExecutionRecord | null> {
    if (!this.db) return null;

    try {
      const record = await this.db.executions?.update({
        where: { id: executionId },
        data: {
          ...updates,
          completedAt: new Date(),
        },
      });
      return record ?? null;
    } catch (error) {
      logger.error('Failed to update execution record', error);
      return null;
    }
  }
}

export default AgentRuntime;
