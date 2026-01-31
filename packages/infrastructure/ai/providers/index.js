import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { Config } from '@kloudi/shared/config';

/**
 * @typedef {import('@ai-sdk/provider').LanguageModelV1} LanguageModelV1
 */

/**
 * ProviderManager - Handles AI provider initialization and configuration
 *
 * Uses createOpenAI/createAnthropic for explicit API key configuration
 * instead of relying on environment variables. This is the recommended
 * approach per AI SDK documentation.
 */
export class ProviderManager {
  /**
   * Get an AI model instance for the specified provider
   * @param {string} provider - The AI provider name (openai, anthropic)
   * @param {string} modelName - The model name to use
   * @returns {LanguageModelV1} The language model instance
   */
  static getModel(provider, modelName) {
    switch (provider.toLowerCase()) {
      case 'openai': {
        const openaiKey = Config.get('ai.apiKeys.openai');

        if (!openaiKey) {
          throw new Error(
            'OpenAI API key is missing from both config and environment'
          );
        }

        const openai = createOpenAI({
          apiKey: openaiKey,
        });

        return openai(modelName);
      }
      case 'anthropic': {
        const anthropicKey = Config.get('ai.apiKeys.anthropic');

        if (!anthropicKey) {
          throw new Error(
            'Anthropic API key is missing from both config and environment'
          );
        }

        const anthropic = createAnthropic({
          apiKey: anthropicKey,
        });

        return anthropic(modelName);
      }
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }
}
