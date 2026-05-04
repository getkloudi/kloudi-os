import type { InternalTool } from '../registry.js';
import type { OrgContext, InspectorResult } from '../types.js';
import { securityInspect } from './security.js';
import { egressInspect } from './egress.js';
import { trustInspect } from './trust.js';
import { repetitionInspect } from './repetition.js';

export async function runInspectors(
  tool: InternalTool,
  params: Record<string, unknown>,
  context: OrgContext
): Promise<InspectorResult> {
  const security = securityInspect(tool, params);
  if (security.verdict !== 'allow') return security;

  const egress = egressInspect(tool, params);
  if (egress.verdict !== 'allow') return egress;

  const trust = await trustInspect(tool, context);
  if (trust.verdict !== 'allow') return trust;

  const repetition = repetitionInspect(tool, params, context);
  if (repetition.verdict !== 'allow') return repetition;

  return { verdict: 'allow', inspector: 'repetition' };
}
