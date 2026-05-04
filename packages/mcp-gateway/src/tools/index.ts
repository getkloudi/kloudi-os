import type { ToolRegistry } from '../registry.js';
import { registerBuiltinTools } from './builtin/index.js';
import { registerGitHubTools } from './github/index.js';
import { registerJiraTools } from './jira/index.js';

export function registerAllTools(registry: ToolRegistry): void {
  registerBuiltinTools(registry);
  registerGitHubTools(registry);
  registerJiraTools(registry);
}
