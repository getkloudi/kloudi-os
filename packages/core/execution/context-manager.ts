import type {
  ContextWindow,
  ContextBudget,
  ContextItem,
  ProcedureRecord,
} from './types.js';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('context-manager');

const DEFAULT_BUDGET: ContextBudget = {
  total: 128000,
  reserved: { system_prompt: 4000, current_sop: 8000, active_context: 16000 },
};

export class ContextManager {
  /**
   * Creates initial context window with system prompt + SOP content.
   */
  initialize(entity: ProcedureRecord): ContextWindow {
    // Check if entity has metadata with a contextBudget override
    const entityAny = entity as unknown as Record<string, unknown>;
    const metadata = entityAny['metadata'] as
      | Record<string, unknown>
      | undefined;
    const budget: ContextBudget =
      metadata && typeof metadata === 'object' && 'contextBudget' in metadata
        ? (metadata['contextBudget'] as ContextBudget)
        : { ...DEFAULT_BUDGET };

    const systemContent = `You are executing procedure: ${entity.name}\n${entity.description || ''}`;
    const sopContent =
      typeof entity.graph === 'string'
        ? entity.graph
        : JSON.stringify(entity.graph);

    const systemItem: ContextItem = {
      id: 'system',
      type: 'system',
      content: systemContent,
      tokens: this.countTokens(systemContent),
      priority: 100,
      timestamp: new Date(),
    };

    const sopItem: ContextItem = {
      id: 'sop',
      type: 'sop',
      content: sopContent,
      tokens: this.countTokens(sopContent),
      priority: 90,
      timestamp: new Date(),
    };

    return {
      budget,
      items: [systemItem, sopItem],
      totalTokensUsed: systemItem.tokens + sopItem.tokens,
      evictedItems: [],
    };
  }

  /**
   * Adds node output to context. Evicts lowest-priority items if over budget.
   */
  update(
    window: ContextWindow,
    nodeId: string,
    output: unknown,
    tokensUsed: number
  ): void {
    const content =
      typeof output === 'string' ? output : JSON.stringify(output);
    const tokens = tokensUsed || this.countTokens(content);

    const item: ContextItem = {
      id: `node:${nodeId}`,
      type: 'node_output',
      content,
      tokens,
      priority: 50,
      timestamp: new Date(),
    };

    window.items.push(item);
    window.totalTokensUsed += tokens;

    // Evict if over budget
    while (window.totalTokensUsed > window.budget.total) {
      const evictable = window.items
        .filter((i) => i.type !== 'system')
        .sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          return a.timestamp.getTime() - b.timestamp.getTime();
        });

      if (evictable.length === 0) {
        // No evictable items — truncate oldest non-system item as last resort
        const nonSystem = window.items.filter((i) => i.type !== 'system');
        const toTruncate = nonSystem[0];
        if (toTruncate) {
          const halfTokens = Math.floor(toTruncate.tokens / 2);
          toTruncate.content = toTruncate.content.slice(
            0,
            toTruncate.content.length / 2
          );
          window.totalTokensUsed -= halfTokens;
          toTruncate.tokens -= halfTokens;
          logger.warn('Context over budget, truncated oldest non-system item', {
            itemId: toTruncate.id,
          });
        }
        break;
      }

      const evicted = evictable[0]!;
      window.items = window.items.filter((i) => i.id !== evicted.id);
      window.totalTokensUsed -= evicted.tokens;
      window.evictedItems.push({
        item: evicted,
        evictedAt: new Date(),
        reason: `Over budget (${window.totalTokensUsed + evicted.tokens}/${window.budget.total})`,
      });
    }
  }

  /**
   * Assembles context items into a single string for LLM calls.
   * Sorted by priority (high first).
   */
  assemble(window: ContextWindow): string {
    return window.items
      .slice()
      .sort((a, b) => b.priority - a.priority)
      .map((item) => item.content)
      .join('\n\n---\n\n');
  }

  /**
   * Approximate token count: Math.ceil(text.length / 4)
   */
  countTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }
}
