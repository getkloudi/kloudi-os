import { parseSkillMd } from './skill-parser.js';
import { convertToGraph } from './skill-to-graph.js';

export { parseSkillMd } from './skill-parser.js';
export type { ParsedSkill, ParsedSection } from './skill-parser.js';
export { convertToGraph } from './skill-to-graph.js';

/**
 * Import a SKILL.md file content into a procedure graph.
 * Returns the procedure data and any warnings.
 */
export function importSkillMd(content: string): {
  procedure: ReturnType<typeof convertToGraph>;
  warnings: string[];
} {
  const warnings: string[] = [];
  const parsed = parseSkillMd(content);

  if (!parsed.frontmatter.name) {
    warnings.push('Missing name in frontmatter');
  }
  if (parsed.sections.length === 0) {
    warnings.push('No sections found — graph will be empty');
  }

  const procedure = convertToGraph(parsed);

  const nodeIds = new Set(procedure.graph.nodes.map((n) => n.id));
  for (const edge of procedure.graph.edges) {
    if (!nodeIds.has(edge.from))
      warnings.push(`Edge references unknown node: ${edge.from}`);
    if (!nodeIds.has(edge.to))
      warnings.push(`Edge references unknown node: ${edge.to}`);
  }

  return { procedure, warnings };
}
