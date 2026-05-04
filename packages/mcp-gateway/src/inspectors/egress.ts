import type { InternalTool } from '../registry.js';
import type { InspectorResult } from '../types.js';

export function egressInspect(
  _tool: InternalTool,
  _params: Record<string, unknown>
): InspectorResult {
  // V0: allow all external traffic
  // V1: maintain per-org allowlist of approved domains
  return { verdict: 'allow', inspector: 'egress' };
}
