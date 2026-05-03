import { buildBuiltinApiTools } from './adapters/api.js';
import type { ToolRegistry } from '../../registry.js';

export function registerBuiltinTools(registry: ToolRegistry): void {
  registry.registerMany(buildBuiltinApiTools());
}
