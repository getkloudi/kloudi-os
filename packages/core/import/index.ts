import { parseSkillMd } from './skill-parser.js';
import { convertToGraph } from './skill-to-graph.js';

export { parseSkillMd } from './skill-parser.js';
export type { ParsedSkill, ParsedSection } from './skill-parser.js';
export { convertToGraph } from './skill-to-graph.js';

/**
 * Import a SKILL.md file content into an SOP graph.
 * Returns the SOP data and any warnings.
 */
export function importSkillMd(content: string): {
  sop: ReturnType<typeof convertToGraph>;
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

  const sop = convertToGraph(parsed);

  const nodeIds = new Set(sop.graph.nodes.map((n) => n.id));
  for (const edge of sop.graph.edges) {
    if (!nodeIds.has(edge.from))
      warnings.push(`Edge references unknown node: ${edge.from}`);
    if (!nodeIds.has(edge.to))
      warnings.push(`Edge references unknown node: ${edge.to}`);
  }

  return { sop, warnings };
}
