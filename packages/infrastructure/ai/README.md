# AI Infrastructure (M2.3)

Business-aware AI infrastructure built on Vercel AI SDK, providing consistent AI capabilities across all packages with cost tracking and compliance support.

## Quick Start

```javascript
import AIClient from '@kloudi/infrastructure/ai';

// Business-aware AI client
const ai = new AIClient({
  context: 'my-app',
  businessDomain: 'customer-service',
  provider: 'openai',
});

// Standard AI SDK message format
const messages = [
  { role: 'system', content: 'You are a helpful assistant' },
  { role: 'user', content: 'Hello!' },
];

// Generate text with business context tracking
const result = await ai.generateText(messages);
console.log(result.text);
```

## Core Features

### Business Context Tracking

- **Context**: Application/package identifier for usage tracking
- **Business Domain**: Cost center and compliance routing
- **Telemetry**: Automatic usage tracking via AI SDK experimental_telemetry

### Provider Abstraction

- **OpenAI**: `gpt-4`, `gpt-3.5-turbo`, etc.
- **Anthropic**: `claude-3-sonnet`, `claude-3-haiku`, etc.
- **Seamless Switching**: Same interface, different providers

### Generic AI Capabilities

- **Text Generation**: `generateText(messages, options)`
- **Streaming**: `streamText(messages, options)`
- **Structured Output**: `generateObject(messages, schema, options)`
- **Health Checks**: `healthCheck()`
- **Graceful Shutdown**: `shutdown()`

## Configuration

```yaml
# packages/infrastructure/config/default.yml
ai:
  provider: openai
  default_model: gpt-4
  temperature: 0.7
```

Environment variables:

- `OPENAI_API_KEY` - Required for OpenAI provider
- `ANTHROPIC_API_KEY` - Required for Anthropic provider

## Architecture

### Pure Infrastructure Layer

```
packages/infrastructure/ai/
├── index.js                # AIClient with Braintrust telemetry
├── telemetry/              # AI telemetry configuration
│   └── braintrust-config.js # Braintrust initialization
├── providers/              # Provider abstraction
│   └── index.js            # OpenAI, Anthropic support
└── monitoring/             # Business context tracking
    └── usage-tracker.js
```

### No Domain Knowledge

- ✅ Generic text generation
- ✅ Provider abstraction
- ✅ Business context tracking
- ❌ No domain-specific methods
- ❌ No application logic
- ❌ No prompt templates

## Usage Examples

### Different Business Contexts

```javascript
// Customer service - high accuracy, compliance tracking
const customerAI = new AIClient({
  context: 'customer-service',
  businessDomain: 'customer-support',
  provider: 'openai',
  model: 'gpt-4',
});

// Internal tools - cost-effective
const internalAI = new AIClient({
  context: 'dev-tools',
  businessDomain: 'development-assistance',
  provider: 'anthropic',
  model: 'claude-3-haiku',
});
```

### Streaming with Business Context

```javascript
const result = await ai.streamText(messages);

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
// Business metrics automatically tracked
```

### Structured Output

```javascript
const schema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  confidence: z.number(),
});

const result = await ai.generateObject(messages, schema);
console.log(result.object); // Typed, validated object
```

## AI Observability & Telemetry

### Built-in Braintrust Telemetry

The AI infrastructure includes **automatic observability** using Braintrust's native AI SDK integration:

```javascript
const ai = new AIClient({
  context: 'my-app',
  businessDomain: 'customer-service',
});

// Automatic telemetry via wrapAISDK
const result = await ai.generateText(messages);
// ✅ Traces appear immediately in Braintrust
```

**Key Features:**

- 🚀 **Automatic tracing** - No manual span management
- 🤖 **AI-native** - Built specifically for LLM observability
- 📊 **Comprehensive logging** - Input/output, tokens, errors
- 🔗 **Tool call tracing** - Automatic tracking of tool executions

### Quick Observability Setup

#### Braintrust (AI-specific observability)

```yaml
# config/local.yml
observability:
  braintrust:
    projectName: 'your-project-name'
    apiKey: 'your-braintrust-api-key'
```

- ✅ AI-specific metrics and experiments
- ✅ Prompt engineering and evaluation
- ✅ LLM performance tracking
- ✅ Automatic span hierarchy for parallel operations

### What Gets Tracked

Your AI operations automatically include:

- 🤖 **Model info** and provider
- 📊 **Token usage** (prompt + completion)
- ⏱️ **Performance** metrics (latency, tokens/sec)
- 🏢 **Business context** (domain, cost center)
- 📝 **Input/output** - Full messages and responses
- 🛠️ **Tool calls** - Automatic tracking of tool executions
- ❌ **Error details** with full context

All telemetry is sent to Braintrust for comprehensive AI observability.

Simple configuration via YAML - just set your Braintrust project name and API key.

## Integration

### Mastishk Integration

```javascript
// packages/mastishk/capabilities/ai-integration.js
import AIClient from '@kloudi/infrastructure/ai';

export class AIIntegration {
  static #aiClient = new AIClient({
    context: 'mastishk-capability',
    businessDomain: 'development-assistance',
  });

  static async analyzeRequest(query) {
    const messages = [
      { role: 'system', content: 'Domain analysis expert...' },
      { role: 'user', content: query },
    ];

    return await this.#aiClient.generateText(messages);
  }
}
```

### Health Monitoring & Lifecycle

```javascript
// AI health is checked directly in your health endpoint
// See apps/api/capabilities/health-endpoint.js for implementation
```

## Migration from Legacy

### Before (M2.1)

```javascript
import { OpenAI } from 'openai';
const openai = new OpenAI({ apiKey });
const response = await openai.chat.completions.create({...});
```

### After (M2.3)

```javascript
import AIClient from '@kloudi/infrastructure/ai';
const ai = new AIClient({ context: 'app', provider: 'openai' });
const result = await ai.generateText(messages);
```

## Benefits

1. **Business-Aware**: Cost tracking and compliance by domain
2. **Provider Agnostic**: Switch between OpenAI/Anthropic seamlessly
3. **Built on Proven Foundation**: Leverages AI SDK's sophistication
4. **Production Ready**: Error handling, retries, telemetry
5. **Consistent Interface**: Same API across all packages
6. **Automatic Observability**: Built-in telemetry with zero configuration

## Dependencies

- `ai@^5.0.0` - Vercel AI SDK v5
- `@ai-sdk/openai@^2.0.0` - OpenAI provider
- `@ai-sdk/anthropic@^2.0.0` - Anthropic provider
- `braintrust@^0.3.0` - AI observability and telemetry

## Status: ✅ Production Ready

M2.3 AI infrastructure with comprehensive observability is implemented and ready for use across all packages.
