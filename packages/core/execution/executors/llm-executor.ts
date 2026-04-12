import type { GraphNode } from '@kloudi/shared/types';
import type {
  ExecutionContext,
  NodeResult,
  NodeExecutor,
  ExecutionEngine,
  LLMConfig,
} from '../types.js';
import type { ContextManager } from '../context-manager.js';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('llm-executor');

interface AIClient {
  generateText(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: Record<string, unknown>
  ): Promise<{ text: string; usage?: { totalTokens?: number } }>;
  generateObject<T>(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    schema: unknown,
    options?: Record<string, unknown>
  ): Promise<{ object: T; usage?: { totalTokens?: number } }>;
}

export class LLMExecutor implements NodeExecutor {
  constructor(
    private aiClient: AIClient,
    private contextManager: ContextManager
  ) {}

  async execute(
    node: GraphNode,
    ctx: ExecutionContext,
    _engine?: ExecutionEngine
  ): Promise<NodeResult> {
    const config = node.config as unknown as LLMConfig;
    const resolvedPrompt =
      typeof config.prompt_template === 'string'
        ? config.prompt_template
        : JSON.stringify(config);

    const messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }> = [
      {
        role: 'system',
        content: this.contextManager.assemble(ctx.contextWindow),
      },
      { role: 'user', content: resolvedPrompt },
    ];

    try {
      // If output_schema exists, use generateObject
      if (config.output_schema) {
        const result = await this.retryOnFailure(() =>
          this.aiClient.generateObject(messages, {
            parse: (data: unknown) => data,
            ...config.output_schema,
          })
        );
        return {
          status: 'completed',
          output: result.object,
          tokensUsed: result.usage?.totalTokens,
        };
      }

      const result = await this.retryOnFailure(() =>
        this.aiClient.generateText(messages)
      );

      // Handle empty response (CEO review requirement)
      if (!result.text || result.text.trim() === '') {
        return {
          status: 'failed',
          output: null,
          error: 'Empty LLM response',
          tokensUsed: result.usage?.totalTokens,
        };
      }

      // Handle refusal (CEO review requirement)
      const lowerText = result.text.toLowerCase();
      if (
        lowerText.includes("i can't") ||
        lowerText.includes('i cannot') ||
        lowerText.includes('i refuse')
      ) {
        return {
          status: 'failed',
          output: result.text,
          error: 'LLM refused to respond',
          tokensUsed: result.usage?.totalTokens,
        };
      }

      return {
        status: 'completed',
        output: result.text,
        tokensUsed: result.usage?.totalTokens,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(
        'LLM execution failed',
        err instanceof Error ? err : new Error(errorMsg),
        {
          nodeId: node.id,
        }
      );
      return { status: 'failed', output: null, error: errorMsg };
    }
  }

  /**
   * Retry with exponential backoff on timeout/network/429 errors.
   * Max 2 retries (3 total attempts).
   */
  private async retryOnFailure<T>(fn: () => Promise<T>): Promise<T> {
    const delays = [1000, 3000]; // backoff: 1s, 3s
    let lastError: unknown;

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        const isRetryable =
          msg.includes('timeout') ||
          msg.includes('ECONNRESET') ||
          msg.includes('ECONNREFUSED') ||
          msg.includes('429') ||
          msg.includes('rate limit') ||
          msg.includes('Too Many Requests');

        if (!isRetryable || attempt >= delays.length) {
          throw err;
        }

        logger.warn(`LLM call failed (attempt ${attempt + 1}), retrying...`, {
          error: msg,
          nextDelayMs: delays[attempt],
        });
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
    }

    throw lastError;
  }
}
