/**
 * SKILL.md → SOP Graph Converter
 *
 * Converts parsed SKILL.md sections into an SOP graph.
 */

import type { ParsedSkill, ParsedSection } from './skill-parser.js';

interface GraphNode {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
}

interface GraphEdge {
  from: string;
  to: string;
  condition?: string | undefined;
}

const WRITE_COMMANDS = [
  'git push',
  'git commit',
  'git merge',
  'git checkout -b',
  'gh pr create',
  'gh issue create',
  'rm ',
  'mv ',
  'cp ',
  'kubectl apply',
  'kubectl delete',
  'docker push',
  'npm publish',
  'pnpm publish',
];

const READ_COMMANDS = [
  'git log',
  'git status',
  'git diff',
  'git branch',
  'gh pr list',
  'gh issue list',
  'gh pr view',
  'gh issue view',
  'ls',
  'cat',
  'head',
  'tail',
  'grep',
  'rg',
  'find',
  'kubectl get',
  'docker ps',
];

export function convertToGraph(parsed: ParsedSkill): {
  name: string;
  slug: string;
  description: string;
  level: string;
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  parameters: Record<string, unknown>;
  metadata: Record<string, unknown>;
} {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const slug = parsed.frontmatter.name || 'imported-skill';
  const sections = parsed.sections.filter((s) => s.level === 2);

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    const nodeId = toNodeId(section.heading);
    const node = sectionToNode(nodeId, section);
    nodes.push(node);

    // Sequential edge to next section
    if (i < sections.length - 1) {
      const nextSection = sections[i + 1]!;
      const nextId = toNodeId(nextSection.heading);

      if (node.type === 'interpolative') {
        // Add conditional edges for each option
        const options = (node.config['options'] as string[]) ?? [];
        if (options.length > 0 && i + options.length < sections.length) {
          for (let j = 0; j < options.length; j++) {
            const target = sections[i + 1 + j];
            if (target) {
              edges.push({
                from: nodeId,
                to: toNodeId(target.heading),
                condition: options[j],
              });
            }
          }
        } else {
          edges.push({ from: nodeId, to: nextId });
        }
      } else {
        edges.push({ from: nodeId, to: nextId });
      }
    }
  }

  return {
    name: parsed.frontmatter.description || slug,
    slug,
    description: parsed.frontmatter.description || '',
    level: 'task',
    graph: { nodes, edges },
    parameters: {},
    metadata: {
      source: 'skill-import',
      originalName: parsed.frontmatter.name,
      importedAt: new Date().toISOString(),
    },
  };
}

function sectionToNode(id: string, section: ParsedSection): GraphNode {
  // Has bash code blocks → tool_call
  const bashBlocks = section.codeBlocks.filter(
    (b) => b.lang === 'bash' || b.lang === 'sh' || b.lang === ''
  );

  if (bashBlocks.length > 0) {
    const code = bashBlocks.map((b) => b.code).join('\n');
    const isWrite = WRITE_COMMANDS.some((cmd) => code.includes(cmd));
    const isRead = !isWrite && READ_COMMANDS.some((cmd) => code.includes(cmd));

    return {
      id,
      name: section.heading,
      type: 'tool_call',
      config: {
        tool_name: 'bash',
        parameters: { command: code },
        requiresApproval: isWrite || (!isRead && !isWrite),
      },
    };
  }

  // Has decision point → interpolative
  if (section.hasDecisionPoint) {
    const options = extractOptions(section.content);
    return {
      id,
      name: section.heading,
      type: 'interpolative',
      config: {
        decision_prompt:
          section.content.split('Options:')[0]?.trim() ?? section.content,
        options,
        reasoning_required: true,
      },
    };
  }

  // Has skill references → sub_entity
  if (section.skillReferences.length > 0) {
    return {
      id,
      name: section.heading,
      type: 'sub_entity',
      config: {
        entity_ref: section.skillReferences[0] ?? '',
        parameter_mapping: {},
      },
    };
  }

  // Default → llm_generate
  return {
    id,
    name: section.heading,
    type: 'llm_generate',
    config: {
      prompt_template: section.content,
    },
  };
}

function toNodeId(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50);
}

function extractOptions(content: string): string[] {
  const options: string[] = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^[A-Da-d]\)\s+(.+)/);
    if (match && match[1]) {
      options.push(match[1].trim());
    }
  }
  return options;
}
