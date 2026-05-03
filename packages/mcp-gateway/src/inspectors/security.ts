import type { InternalTool } from '../registry.js';
import type { InspectorResult } from '../types.js';

const ALWAYS_BLOCK = [
  /rm\s+-rf/,
  /DROP\s+TABLE/i,
  /DROP\s+DATABASE/i,
  /git\s+push\s+.*--force.*main/,
  /git\s+push\s+.*--force.*master/,
  /kubectl\s+delete/,
  /shutdown/i,
  /format\s+[A-Z]:/i,
];

export function securityInspect(
  tool: InternalTool,
  params: Record<string, unknown>
): InspectorResult {
  const paramsStr = JSON.stringify(params);
  for (const pattern of ALWAYS_BLOCK) {
    if (pattern.test(paramsStr)) {
      return {
        verdict: 'block',
        inspector: 'security',
        reason: `Blocked by security inspector: matches ${pattern.toString()}`,
      };
    }
  }
  if (tool.definition.name === 'bash') {
    return { verdict: 'prompt', inspector: 'security' };
  }
  return { verdict: 'allow', inspector: 'security' };
}
