/**
 * Walks a dotted path like "analyze.auth_type" through ctx.variables and ctx.parameters.
 * Checks variables first, then parameters.
 */
export function getNestedValue(
  ctx: {
    variables: Record<string, unknown>;
    parameters: Record<string, unknown>;
  },
  path: string
): unknown {
  const parts = path.split('.');
  const root = parts[0] as string;

  if (!root) return undefined;

  // Check variables first, then parameters
  let value: unknown =
    root in ctx.variables
      ? ctx.variables[root]
      : root in ctx.parameters
        ? ctx.parameters[root]
        : undefined;

  if (value === undefined) {
    return undefined;
  }

  // Walk nested path
  for (let i = 1; i < parts.length; i++) {
    if (value === null || value === undefined) {
      return undefined;
    }
    if (typeof value === 'object') {
      value = (value as Record<string, unknown>)[parts[i]!];
    } else {
      return undefined;
    }
  }

  return value;
}
