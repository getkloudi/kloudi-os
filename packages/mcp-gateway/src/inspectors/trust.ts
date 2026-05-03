import type { InternalTool } from '../registry.js';
import type { OrgContext, InspectorResult } from '../types.js';

export async function trustInspect(
  tool: InternalTool,
  _context: OrgContext
): Promise<InspectorResult> {
  // V0: use the tool's declared default trust level
  // V1: look up trust_scores(userId, toolName) from DB and override
  const verdict =
    tool.definition.defaultTrust === 'block'
      ? 'block'
      : tool.definition.defaultTrust === 'prompt'
        ? 'prompt'
        : 'allow';

  return { verdict, inspector: 'trust' };
}
