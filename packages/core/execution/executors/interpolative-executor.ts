import type { GraphNode } from '@kloudi/shared/types';
import type {
  ExecutionContext, NodeResult, NodeExecutor, ExecutionEngine, InterpolativeConfig,
} from '../types.js';
import type { ContextManager } from '../context-manager.js';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('interpolative-executor');

interface AIClient {
  generateText(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: Record<string, unknown>,
  ): Promise<{ text: string; usage?: { totalTokens?: number } }>;
}

export class InterpolativeExecutor implements NodeExecutor {
  constructor(
    private aiClient: AIClient,
    private contextManager: ContextManager,
  ) {}

  async execute(
    node: GraphNode,
    ctx: ExecutionContext,
    _engine?: ExecutionEngine,
  ): Promise<NodeResult> {
    const config = node.config as unknown as InterpolativeConfig;

    const prompt = `You are making a control flow decision in a procedural execution.

Current context:
${JSON.stringify(ctx.variables, null, 2)}

Decision to make:
${config.decision_prompt}

Available options:
${config.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}

${config.reasoning_required ? 'Explain your reasoning, then state your choice.' : ''}

Respond with JSON: { "reasoning": "...", "choice": "..." }
The "choice" MUST be exactly one of the option values listed above.`;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: this.contextManager.assemble(ctx.contextWindow) },
      { role: 'user', content: prompt },
    ];

    try {
      const result = await this.aiClient.generateText(messages);

      let decision: { reasoning?: string; choice: string };
      try {
        decision = JSON.parse(result.text);
      } catch {
        // Retry once on JSON parse failure
        logger.warn('JSON parse failed, retrying LLM call', { nodeId: node.id });
        const retry = await this.aiClient.generateText(messages);
        decision = JSON.parse(retry.text); // If this throws, it propagates
      }

      // Validate choice is in options
      if (!config.options.includes(decision.choice)) {
        return {
          status: 'failed',
          output: decision,
          error: `Invalid choice '${decision.choice}' — not in options: ${config.options.join(', ')}`,
        };
      }

      return {
        status: 'completed',
        output: decision,
        tokensUsed: result.usage?.totalTokens,
        chosenOption: decision.choice,
        decisionTrace: {
          decisionType: 'interpolative',
          optionsConsidered: config.options,
          chosenOption: decision.choice,
          reasoning: decision.reasoning ?? '',
        },
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('Interpolative execution failed', err instanceof Error ? err : new Error(errorMsg), {
        nodeId: node.id,
      });
      return { status: 'failed', output: null, error: errorMsg };
    }
  }
}
