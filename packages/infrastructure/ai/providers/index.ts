import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { Config } from '@kloudi/shared/config';

/** Language model interface - simplified from @ai-sdk/provider */
interface LanguageModel {
  readonly specificationVersion: string;
  readonly provider: string;
  readonly modelId: string;
  [key: string]: unknown;
}

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
   * @param provider - The AI provider name (openai, anthropic)
   * @param modelName - The model name to use
   * @returns The language model instance
   */
  static getModel(provider: string, modelName: string): LanguageModel {
    switch (provider.toLowerCase()) {
      case 'openai': {
        const openaiKey = Config.get('ai.apiKeys.openai') as string | null;

        if (!openaiKey) {
          throw new Error(
            'OpenAI API key is missing from both config and environment'
          );
        }

        const openai = createOpenAI({
          apiKey: openaiKey,
        });

        return openai(modelName) as unknown as LanguageModel;
      }
      case 'anthropic': {
        const anthropicKey = Config.get('ai.apiKeys.anthropic') as
          | string
          | null;

        if (!anthropicKey) {
          throw new Error(
            'Anthropic API key is missing from both config and environment'
          );
        }

        const anthropic = createAnthropic({
          apiKey: anthropicKey,
        });

        return anthropic(modelName) as unknown as LanguageModel;
      }
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }
}
