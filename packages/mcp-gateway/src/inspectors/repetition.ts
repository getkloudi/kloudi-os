import type { InternalTool } from '../registry.js';
import type { OrgContext, InspectorResult } from '../types.js';

const callHistory = new Map<string, number>();
const MAX_HISTORY_ENTRIES = 10_000;

export function repetitionInspect(
  tool: InternalTool,
  params: Record<string, unknown>,
  context: OrgContext
): InspectorResult {
  const key = `${context.executionId}:${tool.definition.name}:${JSON.stringify(params)}`;
  const count = (callHistory.get(key) ?? 0) + 1;
  if (callHistory.size >= MAX_HISTORY_ENTRIES) {
    const firstKey = callHistory.keys().next().value;
    if (firstKey !== undefined) callHistory.delete(firstKey);
  }
  callHistory.set(key, count);

  if (count > 3) {
    return {
      verdict: 'prompt',
      inspector: 'repetition',
      reason: `Tool called ${count} times with identical params — possible loop`,
    };
  }
  return { verdict: 'allow', inspector: 'repetition' };
}
