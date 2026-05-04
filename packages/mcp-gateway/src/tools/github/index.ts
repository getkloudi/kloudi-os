import { buildGitHubApiTools } from './adapters/api.js';
import type { ToolRegistry } from '../../registry.js';

export function registerGitHubTools(registry: ToolRegistry): void {
  registry.registerMany(buildGitHubApiTools());
}
