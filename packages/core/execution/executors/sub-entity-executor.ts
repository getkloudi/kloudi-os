import type { GraphNode } from '@kloudi/shared/types';
import type {
  ExecutionContext, NodeResult, NodeExecutor, ExecutionEngine, SubEntityConfig,
} from '../types.js';
import { getNestedValue } from '../resolve-path.js';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('sub-entity-executor');

interface ProcedureServiceLike {
  getProcedure(organizationId: string, slug: string): Promise<{ id: string } | null>;
}

export class SubEntityExecutor implements NodeExecutor {
  constructor(private procedureService: ProcedureServiceLike) {}

  async execute(
    node: GraphNode,
    ctx: ExecutionContext,
    engine?: ExecutionEngine,
  ): Promise<NodeResult> {
    if (!engine) {
      return {
        status: 'failed',
        output: null,
        error: 'SubEntityExecutor requires engine reference',
      };
    }

    const config = node.config as unknown as SubEntityConfig;

    // Circular reference guard
    const parentSlug = (ctx.entity as unknown as Record<string, unknown>)['slug'] as string | undefined;
    if (config.entity_ref === parentSlug) {
      return {
        status: 'failed',
        output: null,
        error: `Circular sub-entity reference detected: ${config.entity_ref}`,
      };
    }

    // Look up child procedure
    let childProcedure: { id: string } | null;
    try {
      childProcedure = await this.procedureService.getProcedure(
        ctx.organizationId,
        config.entity_ref,
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to look up child procedure', err instanceof Error ? err : new Error(errorMsg), {
        nodeId: node.id,
        entityRef: config.entity_ref,
      });
      return { status: 'failed', output: null, error: errorMsg };
    }

    if (!childProcedure) {
      return {
        status: 'failed',
        output: null,
        error: `Child procedure not found: ${config.entity_ref}`,
      };
    }

    // Map parameters from parent context to child
    const childParams: Record<string, unknown> = {};
    for (const [childKey, contextPath] of Object.entries(config.parameter_mapping)) {
      childParams[childKey] = getNestedValue(ctx, contextPath);
    }

    // Execute child synchronously using executeAndWait
    try {
      const { result, status } = await engine.executeAndWait(
        childProcedure.id,
        childParams,
        ctx.organizationId,
      );

      if (status === 'completed') {
        return { status: 'completed', output: result };
      }

      return {
        status: 'failed',
        output: result ?? null,
        error: `Child execution ${config.entity_ref} ${status}`,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('Child execution failed', err instanceof Error ? err : new Error(errorMsg), {
        nodeId: node.id,
        childProcedure: config.entity_ref,
      });
      return { status: 'failed', output: null, error: errorMsg };
    }
  }
}
