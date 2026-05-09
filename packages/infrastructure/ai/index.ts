import { ProviderManager } from './providers/index.js';
import { UsageTracker } from './monitoring/usage-tracker.js';
export { ProviderManager, UsageTracker };
import { Logger } from '@kloudi-os/shared/logger';
import { Config } from '@kloudi-os/shared/config';

/** Language model interface - simplified from @ai-sdk/provider */
interface LanguageModel {
  readonly specificationVersion: string;
  readonly provider: string;
  readonly modelId: string;
}

/** Core message type for AI SDK */
interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{ type: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

/** Schema interface for object generation */
interface Schema<T> {
  parse: (data: unknown) => T;
  [key: string]: unknown;
}

/** Result type for generateText */
interface TextResult {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  [key: string]: unknown;
}

/** Result type for streamText */
interface StreamResult {
  textStream: AsyncIterable<string>;
  usage?: Promise<{
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }>;
  [key: string]: unknown;
}

/** Result type for generateObject */
interface ObjectResult<T> {
  object: T;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  [key: string]: unknown;
}

// Dynamic import type for AI SDK
interface AISDKModule {
  generateText: (options: {
    model: LanguageModel;
    messages: Message[];
    [key: string]: unknown;
  }) => Promise<TextResult>;
  streamText: (options: {
    model: LanguageModel;
    messages: Message[];
    [key: string]: unknown;
  }) => Promise<StreamResult>;
  generateObject: <T>(options: {
    model: LanguageModel;
    messages: Message[];
    schema: Schema<T>;
    [key: string]: unknown;
  }) => Promise<ObjectResult<T>>;
}

// Dynamic import of ai SDK (avoids blocking module load)
let _ai: AISDKModule | null = null;
async function getAI(): Promise<AISDKModule> {
  if (!_ai) {
    _ai = (await import('ai')) as unknown as AISDKModule;
  }
  return _ai;
}

/** Configuration options for AIClient */
interface AIClientConfig {
  /** Context identifier for the client */
  context: string;
  /** AI provider (openai, anthropic) */
  provider?: string;
  /** Model name */
  model?: string;
  /** Business domain for tracking */
  businessDomain?: string;
  /** Cost center for tracking */
  costCenter?: string;
  /** Additional options */
  [key: string]: unknown;
}

/** Tracking metadata passed to usage tracker */
interface TrackingMetadata {
  provider: string;
  messageCount: number;
  schemaProvided?: boolean;
  [key: string]: unknown;
}

/** Logger interface from shared package */
interface LoggerInstance {
  info: (message: string, metadata?: Record<string, unknown>) => void;
  error: (
    message: string,
    error?: Error | null,
    metadata?: Record<string, unknown>
  ) => void;
  warn: (message: string, metadata?: Record<string, unknown>) => void;
  debug: (message: string, metadata?: Record<string, unknown>) => void;
}

/**
 * AIClient - Business-aware AI client with provider abstraction
 */
export class AIClient {
  private model: LanguageModel;
  private context: string;
  private businessDomain: string;
  private costCenter: string;
  private logger: LoggerInstance;
  private provider: string;
  private usageTracker: UsageTracker;

  constructor({
    context,
    provider,
    model,
    businessDomain,
    costCenter,
  }: AIClientConfig) {
    this.context = context;
    this.businessDomain = businessDomain ?? 'infrastructure.ai';
    this.costCenter = costCenter ?? 'DEFAULT';
    this.logger = Logger.getInstance(`ai-client-${context}`);

    const aiDefaults = {
      provider: (Config.get('ai.provider') as string | null) ?? 'openai',
      model: (Config.get('ai.model') as string | null) ?? 'gpt-4',
      temperature: (Config.get('ai.temperature') as number | null) ?? 0.7,
    };

    this.provider = provider ?? aiDefaults.provider;
    const modelName = model ?? aiDefaults.model;
    try {
      this.model = ProviderManager.getModel(
        this.provider,
        modelName
      ) as unknown as LanguageModel;

      this.usageTracker = new UsageTracker({
        context,
        businessDomain: this.businessDomain,
        provider: this.provider,
        costCenter: this.costCenter,
      });

      this.logger.info('AI client initialized', {
        context,
        provider: this.provider,
        businessDomain: this.businessDomain,
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error('Failed to initialize AI model', err, {
        provider: this.provider,
        model: modelName,
      });
      throw error;
    }
  }

  async #executeAIOperation<T>(
    operationName: string,
    aiCallback: () => Promise<T>,
    trackingMetadata: TrackingMetadata
  ): Promise<T> {
    try {
      this.logger.info(`Starting ${operationName}`, {
        context: this.context,
        ...trackingMetadata,
      });

      const result = await aiCallback();
      await this.usageTracker.track(operationName, trackingMetadata, result);
      return result;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`${operationName} failed`, err, {
        context: this.context,
        provider: this.provider,
      });
      throw error;
    }
  }

  async generateText(
    messages: Message[],
    options: Record<string, unknown> = {}
  ): Promise<TextResult> {
    const { generateText } = await getAI();
    return this.#executeAIOperation(
      'generateText',
      () => generateText({ model: this.model, messages, ...options }),
      { provider: this.provider, messageCount: messages.length }
    );
  }

  async streamText(
    messages: Message[],
    options: Record<string, unknown> = {}
  ): Promise<StreamResult> {
    const { streamText } = await getAI();
    return this.#executeAIOperation(
      'streamText',
      () => streamText({ model: this.model, messages, ...options }),
      { provider: this.provider, messageCount: messages.length }
    );
  }

  async generateObject<T>(
    messages: Message[],
    schema: Schema<T>,
    options: Record<string, unknown> = {}
  ): Promise<ObjectResult<T>> {
    const { generateObject } = await getAI();
    return this.#executeAIOperation(
      'generateObject',
      () => generateObject({ model: this.model, messages, schema, ...options }),
      {
        provider: this.provider,
        messageCount: messages.length,
        schemaProvided: !!schema,
      }
    );
  }
}

export default AIClient;
