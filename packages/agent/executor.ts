/**
 * Node Executor - Handles execution of individual SOP nodes
 *
 * Implements execution logic for each node type:
 * - llm_generate: Call AI to generate content
 * - tool_call: Execute a tool from the registry
 * - sub_entity: Recursively execute a child SOP
 * - interpolative: AI-guided path selection
 */

import type {
  GraphNode,
  NodeResult,
  InterpolativePath,
  LoggerInstance,
  AIMessage,
  AIGenerateOptions,
  ExecutionResult,
  ProcedureEntity,
} from '@kloudi/shared/types';
import { Logger } from '@kloudi/shared/logger';

const logger: LoggerInstance = Logger.getInstance('agent-executor');

/**
 * Execution context passed to node executors
 */
interface ExecutionContext {
  assembled: string;
  variables: Record<string, unknown>;
}

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
 * Runtime interface for sub-entity execution
 */
interface AgentRuntimeInterface {
  loadEntity(entityId: string): Promise<ProcedureEntity | null>;
  execute(entity: ProcedureEntity, params: Record<string, unknown>): Promise<ExecutionResult>;
}

/**
 * Extended node result with additional fields
 */
interface LLMNodeResult extends NodeResult {
  usage?: Record<string, number> | undefined;
  duration: number;
}

interface ToolNodeResult extends NodeResult {
  tool: string;
  duration: number;
}

interface SubEntityNodeResult extends NodeResult {
  entityId: string;
  childExecution?: ExecutionResult;
  duration: number;
}

interface InterpolativeNodeResult extends NodeResult {
  chosenIndex?: number;
  reasoning?: string;
  duration: number;
}

/**
 * LLM node with config
 */
interface LLMNode extends GraphNode {
  config?: AIGenerateOptions;
}

/**
 * Tool call node
 */
interface ToolNode extends GraphNode {
  tool: string;
  params?: Record<string, unknown>;
}

/**
 * Sub-entity node
 */
interface SubEntityNode extends GraphNode {
  entityId: string;
  params?: Record<string, unknown>;
}

/**
 * Interpolative node with paths
 */
interface InterpolativeNode extends GraphNode {
  question: string;
  paths: InterpolativePathWithDescription[];
}

interface InterpolativePathWithDescription extends InterpolativePath {
  description?: string;
}

/**
 * NodeExecutor - Executes individual SOP graph nodes
 *
 * @class
 */
export class NodeExecutor {
  /**
   * Execute an LLM generation node
   */
  async executeLLM(
    node: LLMNode,
    context: ExecutionContext,
    aiClient: AIClient
  ): Promise<LLMNodeResult> {
    const { id, prompt, config = {} } = node;
    const startTime = Date.now();

    logger.info(`Executing LLM node: ${id}`);

    try {
      // Interpolate variables into prompt
      const interpolatedPrompt = this.interpolateVariables(prompt ?? '', context.variables);

      // Build messages for AI
      const messages: AIMessage[] = [
        {
          role: 'system' as const,
          content: context.assembled || 'You are a helpful assistant executing a structured procedure.',
        },
        {
          role: 'user' as const,
          content: interpolatedPrompt,
        },
      ];

      // Call AI
      const response = await aiClient.generateText(messages, {
        temperature: config.temperature ?? 0.7,
        maxTokens: config.maxTokens ?? 4096,
        ...config,
      });

      const duration = Date.now() - startTime;

      logger.info(`LLM node completed: ${id}`, { duration });

      return {
        success: true,
        nodeId: id,
        nodeType: 'llm_generate',
        output: response.text,
        usage: response.usage,
        duration,
      };
    } catch (error) {
      logger.error(`LLM node failed: ${id}`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        nodeId: id,
        nodeType: 'llm_generate',
        error: errorMessage,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute a tool call node
   */
  async executeTool(
    node: ToolNode,
    context: ExecutionContext,
    toolRegistry: ToolRegistry
  ): Promise<ToolNodeResult> {
    const { id, tool, params = {} } = node;
    const startTime = Date.now();

    logger.info(`Executing tool node: ${id}`, { tool });

    try {
      // Check if tool exists
      if (!toolRegistry.has(tool)) {
        throw new Error(`Tool not found: ${tool}`);
      }

      // Interpolate variables into params
      const interpolatedParams = this.interpolateParams(params, context.variables) as Record<string, unknown>;

      // Execute tool
      const result = await toolRegistry.execute(tool, interpolatedParams);

      const duration = Date.now() - startTime;

      logger.info(`Tool node completed: ${id}`, { tool, duration });

      return {
        success: true,
        nodeId: id,
        nodeType: 'tool_call',
        tool,
        output: result,
        duration,
      };
    } catch (error) {
      logger.error(`Tool node failed: ${id}`, error, { tool });
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        nodeId: id,
        nodeType: 'tool_call',
        tool,
        error: errorMessage,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute a sub-entity node (recursive SOP execution)
   */
  async executeSubEntity(
    node: SubEntityNode,
    context: ExecutionContext,
    runtime: AgentRuntimeInterface
  ): Promise<SubEntityNodeResult> {
    const { id, entityId, params = {} } = node;
    const startTime = Date.now();

    logger.info(`Executing sub-entity node: ${id}`, { entityId });

    try {
      // Interpolate variables into params
      const interpolatedParams = this.interpolateParams(params, context.variables) as Record<string, unknown>;

      // Merge parent variables with child params (child params take precedence)
      const childParams: Record<string, unknown> = {
        ...context.variables,
        ...interpolatedParams,
      };

      // Load the child entity
      const childEntity = await runtime.loadEntity(entityId);
      if (!childEntity) {
        throw new Error(`Sub-entity not found: ${entityId}`);
      }

      // Execute child SOP
      const result = await runtime.execute(childEntity, childParams);

      const duration = Date.now() - startTime;

      logger.info(`Sub-entity node completed: ${id}`, { entityId, duration });

      return {
        success: result.success,
        nodeId: id,
        nodeType: 'sub_entity',
        entityId,
        output: result.output,
        childExecution: result,
        duration,
      };
    } catch (error) {
      logger.error(`Sub-entity node failed: ${id}`, error, { entityId });
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        nodeId: id,
        nodeType: 'sub_entity',
        entityId,
        error: errorMessage,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute an interpolative node (AI-guided path selection)
   */
  async executeInterpolative(
    node: InterpolativeNode,
    context: ExecutionContext,
    aiClient: AIClient
  ): Promise<InterpolativeNodeResult> {
    const { id, question, paths } = node;
    const startTime = Date.now();

    logger.info(`Executing interpolative node: ${id}`);

    try {
      if (!paths || paths.length === 0) {
        throw new Error('Interpolative node requires at least one path');
      }

      // Interpolate question
      const interpolatedQuestion = this.interpolateVariables(question, context.variables);

      // Build path descriptions for AI
      const pathDescriptions = paths
        .map((p, i) => `${i + 1}. ${p.condition}: ${p.description || 'No description'}`)
        .join('\n');

      // Ask AI to choose a path
      const messages: AIMessage[] = [
        {
          role: 'system' as const,
          content: `You are helping navigate a decision in a structured procedure.
Based on the context provided, choose the most appropriate path.
Respond with ONLY the number of the path (e.g., "1" or "2"), nothing else.

${context.assembled || ''}`,
        },
        {
          role: 'user' as const,
          content: `${interpolatedQuestion}

Available paths:
${pathDescriptions}

Which path should be taken? Respond with only the number.`,
        },
      ];

      const response = await aiClient.generateText(messages, {
        temperature: 0.3, // Lower temperature for more deterministic choice
        maxTokens: 10,
      });

      // Parse the chosen path number
      const chosenNumber = parseInt(response.text.trim(), 10);

      if (isNaN(chosenNumber) || chosenNumber < 1 || chosenNumber > paths.length) {
        throw new Error(`Invalid path choice: ${response.text}`);
      }

      const chosenPath = paths[chosenNumber - 1];
      if (!chosenPath) {
        throw new Error(`Path not found at index: ${chosenNumber - 1}`);
      }
      const duration = Date.now() - startTime;

      logger.info(`Interpolative node completed: ${id}`, {
        chosenPath: chosenPath.id || chosenNumber,
        duration,
      });

      return {
        success: true,
        nodeId: id,
        nodeType: 'interpolative',
        chosenPath: chosenPath,
        chosenIndex: chosenNumber - 1,
        reasoning: response.text,
        duration,
      };
    } catch (error) {
      logger.error(`Interpolative node failed: ${id}`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        nodeId: id,
        nodeType: 'interpolative',
        error: errorMessage,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Interpolate variable references in a string
   * Supports {{variable}} syntax
   */
  interpolateVariables(
    template: string,
    variables: Record<string, unknown> = {}
  ): string {
    if (!template) return template;

    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path: string) => {
      const value = this.getNestedValue(variables, path);
      if (value === undefined) {
        logger.warn(`Variable not found: ${path}`);
        return match; // Keep original if not found
      }
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    });
  }

  /**
   * Interpolate variables in a params object (deep)
   */
  interpolateParams(
    params: unknown,
    variables: Record<string, unknown> = {}
  ): unknown {
    if (params === null || params === undefined) return params;

    if (typeof params === 'string') {
      return this.interpolateVariables(params, variables);
    }

    if (Array.isArray(params)) {
      return params.map((item) => this.interpolateParams(item, variables));
    }

    if (typeof params === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(params)) {
        result[key] = this.interpolateParams(value, variables);
      }
      return result;
    }

    return params;
  }

  /**
   * Get a nested value from an object using dot notation
   */
  getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current === 'object' && current !== null) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }
}

export default NodeExecutor;
