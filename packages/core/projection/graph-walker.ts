/**
 * Topological sort of graph nodes following edges.
 * Returns nodes in execution order from entry node.
 */

interface WalkableNode {
  id: string;
  [key: string]: unknown;
}

interface WalkableEdge {
  from?: string;
  source?: string;
  to?: string;
  target?: string;
}

export function walkGraph<T extends WalkableNode>(
  nodes: T[],
  edges: WalkableEdge[]
): T[] {
  if (nodes.length === 0) return [];

  const normalize = (e: WalkableEdge) => ({
    from: e.from ?? e.source ?? '',
    to: e.to ?? e.target ?? '',
  });

  const normalized = edges.map(normalize);

  // Find incoming edge counts
  const incomingCount = new Map<string, number>();
  for (const n of nodes) incomingCount.set(n.id, 0);
  for (const e of normalized) {
    incomingCount.set(e.to, (incomingCount.get(e.to) ?? 0) + 1);
  }

  // Entry nodes: no incoming edges
  const queue: string[] = [];
  for (const [id, count] of incomingCount) {
    if (count === 0) queue.push(id);
  }

  // BFS topological sort
  const visited = new Set<string>();
  const result: T[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Build adjacency list
  const adj = new Map<string, string[]>();
  for (const e of normalized) {
    const list = adj.get(e.from) ?? [];
    list.push(e.to);
    adj.set(e.from, list);
  }

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const node = nodeMap.get(id);
    if (node) result.push(node);

    for (const next of adj.get(id) ?? []) {
      if (!visited.has(next)) {
        queue.push(next);
      }
    }
  }

  // Add any unvisited nodes (disconnected)
  for (const n of nodes) {
    if (!visited.has(n.id)) result.push(n);
  }

  return result;
}
