/**
 * Node Executor - Handles execution of individual SOP nodes
 *
 * Implements execution logic for each node type:
 * - llm_generate: Call AI to generate content
 * - tool_call: Execute a tool from the registry
 * - sub_entity: Recursively execute a child SOP
 * - interpolative: AI-guided path selection
 */

import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('agent-executor');

/**
 * NodeExecutor - Executes individual SOP graph nodes
 *
 * @class
 */
export class NodeExecutor {
  /**
   * Execute an LLM generation node
   *
   * @param {Object} node - The node to execute
   * @param {string} node.id - Node identifier
   * @param {string} node.prompt - Prompt template
   * @param {Object} [node.config] - LLM configuration overrides
   * @param {Object} context - Execution context
   * @param {string} context.assembled - Assembled context string
   * @param {Object} context.variables - Variable bindings
   * @param {Object} aiClient - AI client instance
   * @returns {Promise<Object>} Execution result
   */
  async executeLLM(node, context, aiClient) {
    const { id, prompt, config = {} } = node;
    const startTime = Date.now();

    logger.info(`Executing LLM node: ${id}`);

    try {
      // Interpolate variables into prompt
      const interpolatedPrompt = this.interpolateVariables(prompt, context.variables);

      // Build messages for AI
      const messages = [
        {
          role: 'system',
          content: context.assembled || 'You are a helpful assistant executing a structured procedure.',
        },
        {
          role: 'user',
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

      return {
        success: false,
        nodeId: id,
        nodeType: 'llm_generate',
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute a tool call node
   *
   * @param {Object} node - The node to execute
   * @param {string} node.id - Node identifier
   * @param {string} node.tool - Tool name
   * @param {Object} [node.params] - Tool parameters (can contain variable references)
   * @param {Object} context - Execution context
   * @param {Object} context.variables - Variable bindings
   * @param {Object} toolRegistry - Tool registry instance
   * @returns {Promise<Object>} Execution result
   */
  async executeTool(node, context, toolRegistry) {
    const { id, tool, params = {} } = node;
    const startTime = Date.now();

    logger.info(`Executing tool node: ${id}`, { tool });

    try {
      // Check if tool exists
      if (!toolRegistry.has(tool)) {
        throw new Error(`Tool not found: ${tool}`);
      }

      // Interpolate variables into params
      const interpolatedParams = this.interpolateParams(params, context.variables);

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

      return {
        success: false,
        nodeId: id,
        nodeType: 'tool_call',
        tool,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute a sub-entity node (recursive SOP execution)
   *
   * @param {Object} node - The node to execute
   * @param {string} node.id - Node identifier
   * @param {string} node.entityId - ID of the child SOP entity
   * @param {Object} [node.params] - Parameters to pass to child SOP
   * @param {Object} context - Execution context
   * @param {Object} context.variables - Variable bindings
   * @param {Object} runtime - Agent runtime instance (for recursive calls)
   * @returns {Promise<Object>} Execution result
   */
  async executeSubEntity(node, context, runtime) {
    const { id, entityId, params = {} } = node;
    const startTime = Date.now();

    logger.info(`Executing sub-entity node: ${id}`, { entityId });

    try {
      // Interpolate variables into params
      const interpolatedParams = this.interpolateParams(params, context.variables);

      // Merge parent variables with child params (child params take precedence)
      const childParams = {
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

      return {
        success: false,
        nodeId: id,
        nodeType: 'sub_entity',
        entityId,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute an interpolative node (AI-guided path selection)
   *
   * @param {Object} node - The node to execute
   * @param {string} node.id - Node identifier
   * @param {string} node.question - Question to determine path
   * @param {Array} node.paths - Available paths with conditions
   * @param {Object} context - Execution context
   * @param {string} context.assembled - Assembled context string
   * @param {Object} context.variables - Variable bindings
   * @param {Object} aiClient - AI client instance
   * @returns {Promise<Object>} Execution result with chosen path
   */
  async executeInterpolative(node, context, aiClient) {
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
      const messages = [
        {
          role: 'system',
          content: `You are helping navigate a decision in a structured procedure.
Based on the context provided, choose the most appropriate path.
Respond with ONLY the number of the path (e.g., "1" or "2"), nothing else.

${context.assembled || ''}`,
        },
        {
          role: 'user',
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

      return {
        success: false,
        nodeId: id,
        nodeType: 'interpolative',
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Interpolate variable references in a string
   * Supports {{variable}} syntax
   *
   * @param {string} template - String with variable references
   * @param {Object} variables - Variable bindings
   * @returns {string} Interpolated string
   */
  interpolateVariables(template, variables = {}) {
    if (!template) return template;

    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
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
   *
   * @param {Object} params - Parameters object
   * @param {Object} variables - Variable bindings
   * @returns {Object} Interpolated parameters
   */
  interpolateParams(params, variables = {}) {
    if (!params) return params;

    if (typeof params === 'string') {
      return this.interpolateVariables(params, variables);
    }

    if (Array.isArray(params)) {
      return params.map((item) => this.interpolateParams(item, variables));
    }

    if (typeof params === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(params)) {
        result[key] = this.interpolateParams(value, variables);
      }
      return result;
    }

    return params;
  }

  /**
   * Get a nested value from an object using dot notation
   *
   * @param {Object} obj - Object to get value from
   * @param {string} path - Dot-separated path
   * @returns {*} The value or undefined
   */
  getNestedValue(obj, path) {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }
}

export default NodeExecutor;
