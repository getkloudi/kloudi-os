/**
 * Context Manager - Manages execution context for SOP runtime
 *
 * Handles context window management with token limits, priority-based
 * eviction, and context assembly for LLM calls.
 */

import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('agent-context');

/**
 * Priority levels for context items
 * Higher values = higher priority (less likely to be evicted)
 */
export const ContextPriority = {
  SYSTEM: 100,      // System prompts, never evict
  INSTRUCTION: 80,  // SOP instructions, high priority
  RESULT: 60,       // Execution results
  USER_INPUT: 50,   // User provided context
  HISTORY: 30,      // Previous execution history
  EPHEMERAL: 10,    // Temporary context, evict first
};

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
  /**
   * @param {Object} options
   * @param {number} [options.maxTokens=100000] - Maximum tokens in context
   */
  constructor({ maxTokens = 100000 } = {}) {
    this.maxTokens = maxTokens;
    this.items = [];
    this.currentTokens = 0;
  }

  /**
   * Estimate token count for a string
   * Uses chars/4 approximation (reasonable for most text)
   *
   * @param {string} text - Text to estimate
   * @returns {number} Estimated token count
   */
  estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Add an item to the context
   *
   * @param {Object} item - Context item to add
   * @param {string} item.id - Unique identifier
   * @param {string} item.type - Item type (system, instruction, result, etc.)
   * @param {string} item.content - The content
   * @param {number} [item.priority] - Priority level (default based on type)
   * @param {Object} [item.metadata] - Additional metadata
   * @returns {Object} The added item with computed fields
   */
  add(item) {
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
   *
   * @param {string} id - Item id to remove
   * @returns {boolean} True if item was removed
   */
  remove(id) {
    const index = this.items.findIndex((item) => item.id === id);
    if (index === -1) return false;

    const removed = this.items.splice(index, 1)[0];
    this.currentTokens -= removed.tokens;

    logger.debug(`Context item removed: ${id}`, {
      tokens: removed.tokens,
      totalTokens: this.currentTokens,
    });

    return true;
  }

  /**
   * Get priority for a type
   *
   * @param {string} type - Context type
   * @returns {number} Priority value
   */
  getPriorityForType(type) {
    const priorities = {
      system: ContextPriority.SYSTEM,
      instruction: ContextPriority.INSTRUCTION,
      result: ContextPriority.RESULT,
      user_input: ContextPriority.USER_INPUT,
      history: ContextPriority.HISTORY,
      ephemeral: ContextPriority.EPHEMERAL,
    };
    return priorities[type] || ContextPriority.HISTORY;
  }

  /**
   * Evict lowest priority items to free up tokens
   *
   * @param {number} tokensNeeded - Minimum tokens to free
   * @returns {number} Actual tokens freed
   */
  evict(tokensNeeded = 0) {
    // Sort by priority (ascending) then by age (oldest first)
    const sortedItems = [...this.items].sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.addedAt - b.addedAt;
    });

    let tokensFreed = 0;
    const idsToRemove = [];

    for (const item of sortedItems) {
      // Never evict SYSTEM priority items
      if (item.priority >= ContextPriority.SYSTEM) {
        continue;
      }

      // Check if we've freed enough
      if (this.currentTokens - tokensFreed + tokensNeeded <= this.maxTokens) {
        break;
      }

      idsToRemove.push(item.id);
      tokensFreed += item.tokens;
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
   *
   * @param {string} id - Item id
   * @returns {Object|undefined} The item or undefined
   */
  get(id) {
    return this.items.find((item) => item.id === id);
  }

  /**
   * Get all items of a specific type
   *
   * @param {string} type - Item type
   * @returns {Array} Matching items
   */
  getByType(type) {
    return this.items.filter((item) => item.type === type);
  }

  /**
   * Assemble context for LLM consumption
   * Orders by priority (descending) then by add order
   *
   * @param {Object} [options]
   * @param {Array<string>} [options.types] - Only include these types
   * @param {number} [options.maxTokens] - Override max tokens for this assembly
   * @returns {string} Assembled context string
   */
  assemble(options = {}) {
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
      if (usedTokens + item.tokens > maxTokens) {
        // Skip if would exceed limit
        continue;
      }

      const section = this.formatItem(item);
      sections.push(section);
      usedTokens += item.tokens;
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
   *
   * @param {Object} item - Context item
   * @returns {string} Formatted string
   */
  formatItem(item) {
    const typeLabels = {
      system: 'SYSTEM',
      instruction: 'INSTRUCTION',
      result: 'RESULT',
      user_input: 'USER INPUT',
      history: 'HISTORY',
      ephemeral: 'NOTE',
    };

    const label = typeLabels[item.type] || item.type.toUpperCase();

    // For system type, don't add label wrapper
    if (item.type === 'system') {
      return item.content;
    }

    return `[${label}]\n${item.content}`;
  }

  /**
   * Clear all context items
   */
  clear() {
    this.items = [];
    this.currentTokens = 0;
    logger.debug('Context cleared');
  }

  /**
   * Get context statistics
   *
   * @returns {Object} Stats about current context
   */
  getStats() {
    const byType = {};
    for (const item of this.items) {
      if (!byType[item.type]) {
        byType[item.type] = { count: 0, tokens: 0 };
      }
      byType[item.type].count++;
      byType[item.type].tokens += item.tokens;
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
   *
   * @returns {Object} Serializable snapshot
   */
  snapshot() {
    return {
      maxTokens: this.maxTokens,
      currentTokens: this.currentTokens,
      items: this.items.map((item) => ({ ...item })),
      timestamp: Date.now(),
    };
  }

  /**
   * Restore from a snapshot
   *
   * @param {Object} snapshot - Previously created snapshot
   */
  restore(snapshot) {
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
