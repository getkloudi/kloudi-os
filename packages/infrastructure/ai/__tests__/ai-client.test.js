import { describe, test, expect, beforeEach } from '@jest/globals';
import AIClient from '../index.js';
import { ProviderManager } from '../providers/index.js';

describe('AIClient', () => {
  let client;

  beforeEach(() => {
    client = new AIClient({
      context: 'test',
      provider: 'openai',
      businessDomain: 'testing',
    });
  });

  test('should initialize with correct context', () => {
    expect(client.context).toBe('test');
    expect(client.provider).toBe('openai');
    expect(client.businessDomain).toBe('testing');
    expect(client.costCenter).toBe('DEFAULT');
  });

  test('should have required methods', () => {
    expect(typeof client.generateText).toBe('function');
    expect(typeof client.streamText).toBe('function');
    expect(typeof client.generateObject).toBe('function');
  });

  test('should throw error for unsupported provider', () => {
    expect(() => {
      new AIClient({
        context: 'test',
        provider: 'unsupported-provider',
      });
    }).toThrow('Unsupported provider: unsupported-provider');
  });
});

describe('ProviderManager', () => {
  test('should return supported providers', () => {
    const providers = ProviderManager.getSupportedProviders();
    expect(providers).toContain('openai');
    expect(providers).toContain('anthropic');
  });

  test('should get default model for provider', () => {
    const openaiDefault = ProviderManager.getDefaultModel('openai');
    const anthropicDefault = ProviderManager.getDefaultModel('anthropic');

    expect(openaiDefault).toBe('gpt-4');
    expect(anthropicDefault).toBe('claude-3-sonnet-20240229');
  });

  test('should throw error for unsupported provider', () => {
    expect(() => {
      ProviderManager.getModel('unsupported', 'model');
    }).toThrow('Unsupported provider: unsupported');
  });
});
