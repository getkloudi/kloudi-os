/**
 * Context Manager - Manages execution context for SOP runtime
 *
 * Handles context window management with token limits, priority-based
 * eviction, and context assembly for LLM calls.
 */

import type { ContextItem, ContextManagerConfig, LoggerInstance } from '@kloudi/shared/types';
import { Logger } from '@kloudi/shared/logger';

const logger: LoggerInstance = Logger.getInstance('agent-context');

/**
 * Priority levels for context items
 * Higher values = higher priority (less likely to be evicted)
 */
export const ContextPriority: Record<string, number> = {
  SYSTEM: 100,      // System prompts, never evict
  INSTRUCTION: 80,  // SOP instructions, high priority
  RESULT: 60,       // Execution results
  USER_INPUT: 50,   // User provided context
  HISTORY: 30,      // Previous execution history
  EPHEMERAL: 10,    // Temporary context, evict first
} as const;

/**
 * Internal context item with computed fields
 */
interface InternalContextItem extends ContextItem {
  metadata: Record<string, unknown>;
  addedAt: number;
}

/**
 * Input for adding a context item
 */
interface ContextItemInput {
  id: string;
  type: string;
  content: string;
  priority?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Options for context assembly
 */
interface AssembleOptions {
  types?: string[];
  maxTokens?: number;
}

/**
 * Context snapshot for serialization
 */
interface ContextSnapshot {
  maxTokens: number;
  currentTokens: number;
  items: InternalContextItem[];
  timestamp: number;
}

/**
 * Statistics about context usage by type
 */
interface TypeStats {
  count: number;
  tokens: number;
}

/**
 * Context statistics
 */
interface ContextStats {
  totalItems: number;
  totalTokens: number;
  maxTokens: number;
  utilizationPercent: number;
  byType: Record<string, TypeStats>;
}

/**
 * ContextManager - Manages execution context with token limits
 *
 * Features:
 * - Token-aware context management
 * - Priority-based eviction
 * - Context assembly for LLM calls
 *
 * @class
 */
export class ContextManager {
  private maxTokens: number;
  private items: InternalContextItem[];
  private currentTokens: number;

  constructor({ maxTokens = 100000 }: ContextManagerConfig = {}) {
    this.maxTokens = maxTokens;
    this.items = [];
    this.currentTokens = 0;
  }

  /**
   * Estimate token count for a string
   * Uses chars/4 approximation (reasonable for most text)
   */
  estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Add an item to the context
   */
  add(item: ContextItemInput): InternalContextItem {
    const {
      id,
      type,
      content,
      priority = this.getPriorityForType(type),
      metadata = {},
    } = item;

    if (!id || !type || content === undefined) {
      throw new Error('Context item requires id, type, and content');
    }

    const tokens = this.estimateTokens(content);
    const contextItem = {
      id,
      type,
      content,
      priority,
      tokens,
      metadata,
      addedAt: Date.now(),
    };

    // Check if we need to evict before adding
    if (this.currentTokens + tokens > this.maxTokens) {
      this.evict(tokens);
    }

    // Remove existing item with same id
    this.remove(id);

    this.items.push(contextItem);
    this.currentTokens += tokens;

    logger.debug(`Context item added: ${id}`, {
      type,
      tokens,
      totalTokens: this.currentTokens,
    });

    return contextItem;
  }

  /**
   * Remove an item from context by id
   */
  remove(id: string): boolean {
    const index = this.items.findIndex((item) => item.id === id);
    if (index === -1) return false;

    const removed = this.items.splice(index, 1)[0];
    if (!removed) return false;
    this.currentTokens -= removed.tokens ?? 0;

    logger.debug(`Context item removed: ${id}`, {
      tokens: removed.tokens ?? 0,
      totalTokens: this.currentTokens,
    });

    return true;
  }

  /**
   * Get priority for a type
   */
  getPriorityForType(type: string): number {
    const priorities: Record<string, number | undefined> = {
      system: ContextPriority['SYSTEM'],
      instruction: ContextPriority['INSTRUCTION'],
      result: ContextPriority['RESULT'],
      user_input: ContextPriority['USER_INPUT'],
      history: ContextPriority['HISTORY'],
      ephemeral: ContextPriority['EPHEMERAL'],
    };
    return priorities[type] ?? ContextPriority['HISTORY'] ?? 30;
  }

  /**
   * Evict lowest priority items to free up tokens
   */
  evict(tokensNeeded: number = 0): number {
    // Sort by priority (ascending) then by age (oldest first)
    const sortedItems = [...this.items].sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.addedAt - b.addedAt;
    });

    let tokensFreed = 0;
    const idsToRemove = [];

    const systemPriority = ContextPriority['SYSTEM'] ?? 100;
    for (const item of sortedItems) {
      // Never evict SYSTEM priority items
      if (item.priority >= systemPriority) {
        continue;
      }

      // Check if we've freed enough
      if (this.currentTokens - tokensFreed + tokensNeeded <= this.maxTokens) {
        break;
      }

      idsToRemove.push(item.id);
      tokensFreed += item.tokens ?? 0;
    }

    // Remove evicted items
    for (const id of idsToRemove) {
      this.remove(id);
    }

    if (idsToRemove.length > 0) {
      logger.info(`Evicted ${idsToRemove.length} context items`, {
        tokensFreed,
        totalTokens: this.currentTokens,
      });
    }

    return tokensFreed;
  }

  /**
   * Get an item by id
   */
  get(id: string): InternalContextItem | undefined {
    return this.items.find((item) => item.id === id);
  }

  /**
   * Get all items of a specific type
   */
  getByType(type: string): InternalContextItem[] {
    return this.items.filter((item) => item.type === type);
  }

  /**
   * Assemble context for LLM consumption
   * Orders by priority (descending) then by add order
   */
  assemble(options: AssembleOptions = {}): string {
    const { types, maxTokens = this.maxTokens } = options;

    let items = [...this.items];

    // Filter by types if specified
    if (types && types.length > 0) {
      items = items.filter((item) => types.includes(item.type));
    }

    // Sort by priority (descending) then by add order
    items.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.addedAt - b.addedAt;
    });

    // Build context string respecting token limit
    const sections = [];
    let usedTokens = 0;

    for (const item of items) {
      const itemTokens = item.tokens ?? 0;
      if (usedTokens + itemTokens > maxTokens) {
        // Skip if would exceed limit
        continue;
      }

      const section = this.formatItem(item);
      sections.push(section);
      usedTokens += itemTokens;
    }

    const assembled = sections.join('\n\n');

    logger.debug('Context assembled', {
      itemCount: sections.length,
      tokens: usedTokens,
      maxTokens,
    });

    return assembled;
  }

  /**
   * Format a context item for inclusion in assembled context
   */
  formatItem(item: InternalContextItem): string {
    const typeLabels: Record<string, string> = {
      system: 'SYSTEM',
      instruction: 'INSTRUCTION',
      result: 'RESULT',
      user_input: 'USER INPUT',
      history: 'HISTORY',
      ephemeral: 'NOTE',
    };

    const label = typeLabels[item.type] ?? item.type.toUpperCase();

    // For system type, don't add label wrapper
    if (item.type === 'system') {
      return item.content;
    }

    return `[${label}]\n${item.content}`;
  }

  /**
   * Clear all context items
   */
  clear(): void {
    this.items = [];
    this.currentTokens = 0;
    logger.debug('Context cleared');
  }

  /**
   * Get context statistics
   */
  getStats(): ContextStats {
    const byType: Record<string, TypeStats> = {};
    for (const item of this.items) {
      const existing = byType[item.type];
      if (!existing) {
        byType[item.type] = { count: 0, tokens: 0 };
      }
      const typeStats = byType[item.type];
      if (typeStats) {
        typeStats.count++;
        typeStats.tokens += item.tokens ?? 0;
      }
    }

    return {
      totalItems: this.items.length,
      totalTokens: this.currentTokens,
      maxTokens: this.maxTokens,
      utilizationPercent: Math.round((this.currentTokens / this.maxTokens) * 100),
      byType,
    };
  }

  /**
   * Create a snapshot of the current context
   */
  snapshot(): ContextSnapshot {
    return {
      maxTokens: this.maxTokens,
      currentTokens: this.currentTokens,
      items: this.items.map((item) => ({ ...item })),
      timestamp: Date.now(),
    };
  }

  /**
   * Restore from a snapshot
   */
  restore(snapshot: ContextSnapshot): void {
    this.maxTokens = snapshot.maxTokens;
    this.currentTokens = snapshot.currentTokens;
    this.items = snapshot.items.map((item) => ({ ...item }));
    logger.info('Context restored from snapshot', {
      items: this.items.length,
      tokens: this.currentTokens,
    });
  }
}

export default ContextManager;
