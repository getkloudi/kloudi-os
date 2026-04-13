import type {
  ExecutionContext,
  NodeExecutor,
  NodeResult,
  ExecutionCallbacks,
  TrustGateContext,
  SopRecord,
} from './types.js';
import type { GraphNode, Graph, NodeType } from '@kloudi/shared/types';
import { ContextManager } from './context-manager.js';
import { getNestedValue } from './resolve-path.js';
import { Database } from '@kloudi/infrastructure/database';
import { SopRepository } from '../sops/sop-repository.js';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('execution-engine');

const DEFAULT_TIMEOUT_MS = 600_000; // 10 minutes
const DEFAULT_CONCURRENCY_LIMIT = 5;
const DEFAULT_CYCLE_THRESHOLD = 3;

export class ExecutionEngine {
  private sopRepository = new SopRepository();

  constructor(
    private executors: Map<NodeType, NodeExecutor>,
    private contextManager: ContextManager
  ) {}

  /**
   * Entry point. Creates Execution record, kicks off async graph traversal,
   * returns immediately with the execution ID.
   */
  async execute(
    sopId: string,
    params: Record<string, unknown>,
    organizationId: string,
    callbacks?: ExecutionCallbacks,
    options?: { userId?: string; timeoutMs?: number; concurrencyLimit?: number }
  ): Promise<{ executionId: string }> {
    const db = await Database.getInstance().getClient();

    // Concurrency limit check (counts both top-level and child executions)
    const limit = options?.concurrencyLimit ?? DEFAULT_CONCURRENCY_LIMIT;
    const activeCount = await (db as any).execution.count({
      where: { organizationId, status: { in: ['running', 'pending'] } },
    });
    if (activeCount >= limit) {
      throw new Error(
        `Concurrent execution limit reached (${activeCount}/${limit})`
      );
    }

    // Look up procedure
    const entity = await this.sopRepository.findById(sopId);
    if (!entity) {
      throw new Error(`SOP not found: ${sopId}`);
    }

    const graph = entity.graph as Graph;
    const entryNodeId = this.findEntryNode(graph);

    // Create execution record
    const execution = await (db as any).execution.create({
      data: {
        sopId,
        status: 'pending',
        parameters: params,
        variables: {},
        currentNodeId: null,
        organizationId,
        userId: options?.userId ?? null,
        tokensUsed: 0,
      },
    });

    const executionId = execution.id;
    logger.info('Execution started', {
      executionId,
      sopId,
      organizationId,
    });

    // Build context
    const ctx: ExecutionContext = {
      executionId,
      entity: entity as SopRecord,
      parameters: params,
      variables: {},
      currentNodeId: entryNodeId,
      contextWindow: this.contextManager.initialize(entity as SopRecord),
      visitedNodes: new Map(),
      organizationId,
    };

    // Kick off async traversal
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    setImmediate(() => {
      this.runGraph(ctx, graph, callbacks, db, timeoutMs).catch((err) => {
        logger.error('Graph execution failed', err, { executionId });
      });
    });

    return { executionId };
  }

  /**
   * Like execute(), but awaits graph traversal.
   * Used by SubEntityExecutor for child executions.
   */
  async executeAndWait(
    sopId: string,
    params: Record<string, unknown>,
    organizationId: string,
    callbacks?: ExecutionCallbacks,
    options?: { userId?: string; timeoutMs?: number; concurrencyLimit?: number }
  ): Promise<{ executionId: string; result: unknown; status: string }> {
    const db = await Database.getInstance().getClient();

    // Concurrency check (child executions count against the same limit)
    const limit = options?.concurrencyLimit ?? DEFAULT_CONCURRENCY_LIMIT;
    const activeCount = await (db as any).execution.count({
      where: { organizationId, status: { in: ['running', 'pending'] } },
    });
    if (activeCount >= limit) {
      throw new Error(
        `Concurrent execution limit reached (${activeCount}/${limit})`
      );
    }

    const entity = await this.sopRepository.findById(sopId);
    if (!entity) {
      throw new Error(`SOP not found: ${sopId}`);
    }

    const graph = entity.graph as Graph;
    const entryNodeId = this.findEntryNode(graph);

    const execution = await (db as any).execution.create({
      data: {
        sopId,
        status: 'pending',
        parameters: params,
        variables: {},
        currentNodeId: null,
        organizationId,
        userId: options?.userId ?? null,
        tokensUsed: 0,
      },
    });

    const executionId = execution.id;

    const ctx: ExecutionContext = {
      executionId,
      entity: entity as SopRecord,
      parameters: params,
      variables: {},
      currentNodeId: entryNodeId,
      contextWindow: this.contextManager.initialize(entity as SopRecord),
      visitedNodes: new Map(),
      organizationId,
    };

    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    await this.runGraph(ctx, graph, callbacks, db, timeoutMs);

    // Fetch final state
    const final = await (db as any).execution.findUnique({
      where: { id: executionId },
    });

    return {
      executionId,
      result: final?.result ?? null,
      status: final?.status ?? 'failed',
    };
  }

  /**
   * Main graph traversal loop.
   */
  private async runGraph(
    ctx: ExecutionContext,
    graph: Graph,
    callbacks: ExecutionCallbacks | undefined,
    db: any,
    timeoutMs: number
  ): Promise<void> {
    const startTime = Date.now();
    let currentNodeId: string | null = ctx.currentNodeId;

    // Set execution to running
    await db.execution.update({
      where: { id: ctx.executionId },
      data: { status: 'running', currentNodeId },
    });

    try {
      while (currentNodeId) {
        // Timeout check
        if (Date.now() - startTime > timeoutMs) {
          throw new Error(`Execution timed out after ${timeoutMs}ms`);
        }

        // Cancel check
        const current = await db.execution.findUnique({
          where: { id: ctx.executionId },
          select: { status: true },
        });
        if (current?.status === 'cancelled') {
          logger.info('Execution cancelled', { executionId: ctx.executionId });
          callbacks?.onExecutionFailed?.(
            ctx.executionId,
            'Execution cancelled'
          );
          return;
        }

        const node = graph.nodes.find((n) => n.id === currentNodeId);
        if (!node) {
          throw new Error(`Node not found in graph: ${currentNodeId}`);
        }

        // Cycle guard (configurable threshold, default 3)
        const visitCount = ctx.visitedNodes.get(currentNodeId) ?? 0;
        if (visitCount >= DEFAULT_CYCLE_THRESHOLD) {
          if (callbacks?.onHumanApprovalNeeded) {
            const response = await callbacks.onHumanApprovalNeeded(
              ctx.executionId,
              currentNodeId,
              `Node '${node.name}' is about to run again (visit #${visitCount + 1}). Continue or abort?`
            );
            if (response !== 'continue') {
              throw new Error(
                `Human aborted at node '${node.name}' (visit #${visitCount + 1})`
              );
            }
          } else {
            throw new Error(
              `Cycle detected at node '${node.name}' (visit #${visitCount + 1}, no approval callback)`
            );
          }
        }
        ctx.visitedNodes.set(currentNodeId, visitCount + 1);

        // Get executor for this node type
        const executor = this.executors.get(node.type as NodeType);
        if (!executor) {
          throw new Error(`No executor registered for node type: ${node.type}`);
        }

        // Resolve inputs (variable interpolation)
        const resolvedConfig = this.resolveInputs(node, ctx);
        const resolvedNode = { ...node, config: resolvedConfig };

        // Create ExecutionNode record
        const nodeStartTime = Date.now();
        callbacks?.onNodeStart?.(ctx.executionId, currentNodeId, node.name);
        logger.info('Node started', {
          executionId: ctx.executionId,
          nodeId: currentNodeId,
          nodeType: node.type,
        });

        await db.executionNode.create({
          data: {
            executionId: ctx.executionId,
            nodeId: currentNodeId,
            status: 'running',
            input: resolvedConfig,
            startedAt: new Date(),
          },
        });

        // Trust gate check — tool_call nodes with requiresApproval
        if (
          node.type === 'tool_call' &&
          (node.config as Record<string, unknown>)?.['requiresApproval']
        ) {
          const nodeConfig = node.config as Record<string, unknown>;
          const gateContext: TrustGateContext = {
            executionId: ctx.executionId,
            nodeId: currentNodeId,
            nodeName: node.name,
            nodeType: node.type as NodeType,
            action: `Tool call: ${nodeConfig['tool_name']}`,
            config: resolvedConfig,
            visitCount: visitCount + 1,
          };

          // Persist gate context (survives restart)
          await db.executionNode.update({
            where: {
              executionId_nodeId_attemptNumber: {
                executionId: ctx.executionId,
                nodeId: currentNodeId,
                attemptNumber: 1,
              },
            },
            data: {
              status: 'waiting_input',
              gateContext: gateContext as any,
            },
          });

          // Update execution status
          await db.execution.update({
            where: { id: ctx.executionId },
            data: { status: 'waiting_input', currentNodeId },
          });

          if (callbacks?.onTrustGateTriggered) {
            const decision = await callbacks.onTrustGateTriggered(gateContext);

            // Resume execution status
            await db.execution.update({
              where: { id: ctx.executionId },
              data: { status: 'running' },
            });

            if (decision === 'reject') {
              await db.executionNode.update({
                where: {
                  executionId_nodeId_attemptNumber: {
                    executionId: ctx.executionId,
                    nodeId: currentNodeId,
                    attemptNumber: 1,
                  },
                },
                data: {
                  status: 'failed',
                  completedAt: new Date(),
                  output: { decision: 'rejected' } as any,
                },
              });
              throw new Error(`Trust gate rejected at node '${node.name}'`);
            }

            // Approved — update gate node and continue to execution
            await db.executionNode.update({
              where: {
                executionId_nodeId_attemptNumber: {
                  executionId: ctx.executionId,
                  nodeId: currentNodeId,
                  attemptNumber: 1,
                },
              },
              data: {
                status: 'running',
                gateContext: {
                  ...(gateContext as any),
                  decision: 'approved',
                },
              },
            });
          } else {
            // No callback registered — auto-approve with warning
            logger.warn(
              'Trust gate triggered but no callback registered, auto-approving',
              {
                executionId: ctx.executionId,
                nodeId: currentNodeId,
              }
            );

            // Resume execution status
            await db.execution.update({
              where: { id: ctx.executionId },
              data: { status: 'running' },
            });

            await db.executionNode.update({
              where: {
                executionId_nodeId_attemptNumber: {
                  executionId: ctx.executionId,
                  nodeId: currentNodeId,
                  attemptNumber: 1,
                },
              },
              data: { status: 'running' },
            });
          }
        }

        // Execute the node
        let result: NodeResult;
        try {
          result = await executor.execute(resolvedNode, ctx, this as any);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          result = { status: 'failed', output: null, error: errorMsg };
        }

        const nodeDurationMs = Date.now() - nodeStartTime;

        // Update ExecutionNode record
        await db.executionNode.update({
          where: {
            executionId_nodeId_attemptNumber: {
              executionId: ctx.executionId,
              nodeId: currentNodeId,
              attemptNumber: 1,
            },
          },
          data: {
            status: result.status,
            output: result.output as any,
            decisionTrace: result.decisionTrace as any,
            tokensUsed: result.tokensUsed ?? 0,
            durationMs: nodeDurationMs,
            completedAt: new Date(),
          },
        });

        // Update context with node output
        ctx.variables[currentNodeId] = result.output;
        if (result.tokensUsed) {
          this.contextManager.update(
            ctx.contextWindow,
            currentNodeId,
            result.output,
            result.tokensUsed
          );
        }

        // Update execution record
        const totalTokens = result.tokensUsed ?? 0;
        await db.execution.update({
          where: { id: ctx.executionId },
          data: {
            variables: ctx.variables,
            currentNodeId,
            tokensUsed: { increment: totalTokens },
          },
        });

        if (result.status === 'failed') {
          const errorMsg = result.error ?? 'Node execution failed';
          callbacks?.onNodeFailed?.(ctx.executionId, currentNodeId, errorMsg);
          logger.error('Node failed', new Error(errorMsg), {
            executionId: ctx.executionId,
            nodeId: currentNodeId,
          });
          throw new Error(`Node '${node.name}' failed: ${errorMsg}`);
        }

        if (result.status === 'waiting_input') {
          await db.execution.update({
            where: { id: ctx.executionId },
            data: { status: 'waiting_input' },
          });
          callbacks?.onNodeComplete?.(
            ctx.executionId,
            currentNodeId,
            result.output
          );
          // Execution pauses here — will be resumed externally
          return;
        }

        callbacks?.onNodeComplete?.(
          ctx.executionId,
          currentNodeId,
          result.output
        );
        logger.info('Node completed', {
          executionId: ctx.executionId,
          nodeId: currentNodeId,
          durationMs: nodeDurationMs,
          tokensUsed: result.tokensUsed,
        });

        // Find next node
        currentNodeId = this.findNextNode(node, result, ctx, graph);
        ctx.currentNodeId = currentNodeId;
      }

      // Execution completed successfully
      const durationMs = Date.now() - startTime;
      const lastOutput = Object.values(ctx.variables).pop();

      await db.execution.update({
        where: { id: ctx.executionId },
        data: {
          status: 'completed',
          result: lastOutput as any,
          durationMs,
          completedAt: new Date(),
          currentNodeId: null,
        },
      });

      callbacks?.onExecutionComplete?.(ctx.executionId, lastOutput);
      logger.info('Execution completed', {
        executionId: ctx.executionId,
        durationMs,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const durationMs = Date.now() - startTime;

      await db.execution.update({
        where: { id: ctx.executionId },
        data: {
          status: 'failed',
          error: errorMsg,
          durationMs,
          completedAt: new Date(),
        },
      });

      callbacks?.onExecutionFailed?.(ctx.executionId, errorMsg);
      logger.error(
        'Execution failed',
        err instanceof Error ? err : new Error(errorMsg),
        {
          executionId: ctx.executionId,
          durationMs,
        }
      );
    }
  }

  /**
   * Finds the single entry node (no incoming edges). Throws if 0 or >1.
   */
  private findEntryNode(graph: Graph): string {
    const nodesWithIncoming = new Set(graph.edges.map((e) => e.to));
    const entryNodes = graph.nodes.filter((n) => !nodesWithIncoming.has(n.id));

    if (entryNodes.length === 0) {
      throw new Error(
        'Graph has no entry node (all nodes have incoming edges)'
      );
    }
    if (entryNodes.length > 1) {
      throw new Error(
        `Graph has multiple entry nodes: ${entryNodes.map((n) => n.id).join(', ')}`
      );
    }

    return entryNodes[0]!.id;
  }

  /**
   * Determines the next node after executing the current one.
   * For interpolative nodes, uses chosenOption.
   * For conditional edges, evaluates condition against ctx.variables.
   */
  private findNextNode(
    currentNode: GraphNode,
    result: NodeResult,
    ctx: ExecutionContext,
    graph: Graph
  ): string | null {
    // For interpolative nodes, the result specifies which node to go to
    if (currentNode.type === 'interpolative' && result.chosenOption) {
      const targetEdge = graph.edges.find(
        (e) => e.from === currentNode.id && e.to === result.chosenOption
      );
      if (targetEdge) return targetEdge.to;
      // If chosenOption is a node ID directly
      if (graph.nodes.some((n) => n.id === result.chosenOption)) {
        return result.chosenOption;
      }
    }

    // Find outgoing edges
    const outgoing = graph.edges.filter((e) => e.from === currentNode.id);

    if (outgoing.length === 0) return null; // Terminal node

    // If there's a conditional edge, evaluate it
    for (const edge of outgoing) {
      if (edge.condition) {
        try {
          // Simple evaluation: check if the condition path is truthy in variables
          const value = getNestedValue(ctx, edge.condition);
          if (value) return edge.to;
        } catch {
          // Skip this edge if condition evaluation fails
        }
      }
    }

    // Default: take the first unconditional edge
    const unconditional = outgoing.find((e) => !e.condition);
    return unconditional?.to ?? outgoing[0]?.to ?? null;
  }

  /**
   * Replaces {{variable}} and {{variable.nested.path}} in node config values.
   */
  private resolveInputs(
    node: GraphNode,
    ctx: ExecutionContext
  ): Record<string, unknown> {
    const config = node.config;
    const resolved: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string') {
        resolved[key] = value.replace(
          /\{\{([^}]+)\}\}/g,
          (_match, path: string) => {
            const trimmed = path.trim();
            const result = getNestedValue(ctx, trimmed);
            if (result === undefined) {
              throw new Error(
                `Variable '${trimmed}' not found in execution context (node: ${node.id})`
              );
            }
            return typeof result === 'string' ? result : JSON.stringify(result);
          }
        );
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }
}
