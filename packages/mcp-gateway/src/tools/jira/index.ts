import { buildJiraApiTools } from './adapters/api.js';
import type { ToolRegistry } from '../../registry.js';

export function registerJiraTools(registry: ToolRegistry): void {
  registry.registerMany(buildJiraApiTools());
}
