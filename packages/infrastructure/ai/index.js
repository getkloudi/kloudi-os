import { ProviderManager } from './providers/index.js';
import { UsageTracker } from './monitoring/usage-tracker.js';
import { Logger } from '@kloudi/shared/logger';
import { Config } from '@kloudi/shared/config';

/**
 * @typedef {import('@ai-sdk/provider').LanguageModelV1} LanguageModelV1
 */

// Dynamic import of ai SDK (avoids blocking module load)
let _ai = null;
async function getAI() {
  if (!_ai) {
    _ai = await import('ai');
  }
  return _ai;
}

/**
 * AIClient - Business-aware AI client with provider abstraction
 * @class
 */
export class AIClient {
  /** @type {LanguageModelV1} */
  model;

  /**
   * @param {Object} config - Configuration object
   * @param {string} config.context - Context identifier for the client
   * @param {string} [config.provider] - AI provider (openai, anthropic)
   * @param {string} [config.model] - Model name
   * @param {string} [config.businessDomain] - Business domain for tracking
   * @param {string} [config.costCenter] - Cost center for tracking
   */
  constructor({
    context,
    provider,
    model,
    businessDomain,
    costCenter,
    ...options
  }) {
    this.context = context;
    this.businessDomain = businessDomain || 'infrastructure.ai';
    this.costCenter = costCenter || 'DEFAULT';
    this.options = options;
    this.logger = Logger.getInstance(`ai-client-${context}`);

    const aiDefaults = {
      provider: Config.get('ai.provider') || 'openai',
      model: Config.get('ai.model') || 'gpt-4',
      temperature: Config.get('ai.temperature') || 0.7,
    };

    this.provider = provider || aiDefaults.provider;
    const modelName = model || aiDefaults.model;
    try {
      this.model = ProviderManager.getModel(this.provider, modelName);

      this.usageTracker = new UsageTracker({
        context,
        businessDomain: this.businessDomain,
        provider: this.businessDomain,
        costCenter: this.costCenter,
        ...options,
      });

      this.logger.info('AI client initialized', {
        context,
        provider: this.provider,
        businessDomain: this.businessDomain,
      });
    } catch (error) {
      this.logger.error('Failed to initialize AI model', {
        provider: this.provider,
        model: modelName,
        error: error.message,
      });
      throw error;
    }
  }

  async #executeAIOperation(operationName, aiCallback, trackingMetadata) {
    try {
      this.logger.info(`Starting ${operationName}`, {
        context: this.context,
        provider: this.provider,
        ...trackingMetadata,
      });

      const result = await aiCallback();
      await this.usageTracker.track(operationName, trackingMetadata, result);
      return result;
    } catch (error) {
      this.logger.error(`${operationName} failed`, {
        context: this.context,
        provider: this.provider,
        error: error.message,
      });
      throw error;
    }
  }

  async generateText(messages, options = {}) {
    const { generateText } = await getAI();
    return this.#executeAIOperation(
      'generateText',
      () => generateText({ model: this.model, messages, ...options }),
      { provider: this.provider, messageCount: messages.length }
    );
  }

  async streamText(messages, options = {}) {
    const { streamText } = await getAI();
    return this.#executeAIOperation(
      'streamText',
      () => streamText({ model: this.model, messages, ...options }),
      { provider: this.provider, messageCount: messages.length }
    );
  }

  async generateObject(messages, schema, options = {}) {
    const { generateObject } = await getAI();
    return this.#executeAIOperation(
      'generateObject',
      () => generateObject({ model: this.model, messages, schema, ...options }),
      { provider: this.provider, messageCount: messages.length, schemaProvided: !!schema }
    );
  }
}

export default AIClient;
