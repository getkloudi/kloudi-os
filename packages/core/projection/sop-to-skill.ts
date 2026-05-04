/**
 * SOP → SKILL.md Projection
 *
 * Converts an SOP graph into a gstack-compatible SKILL.md file.
 * Deterministic: same input always produces the same output.
 */

import { walkGraph } from './graph-walker.js';

interface SopInput {
  name: string;
  slug: string;
  description: string;
  level: string;
  graph: {
    nodes: {
      id: string;
      name: string;
      description?: string;
      // AI-native schema
      available_tools?: string[];
      trust_required?: string;
      context_sources?: unknown[];
      // Legacy schema
      type?: string;
      config?: Record<string, unknown>;
    }[];
    edges: { from?: string; source?: string; to?: string; target?: string }[];
  };
  parameters: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export function projectToSkillMd(sop: SopInput): string {
  const { name, slug, description, graph, parameters, metadata } = sop;
  const orderedNodes = walkGraph(graph.nodes, graph.edges);

  const lines: string[] = [];

  // Frontmatter
  const allowedTools = extractAllowedTools(orderedNodes);
  const version =
    typeof metadata?.['version'] === 'string' ? metadata['version'] : '1.0.0';

  lines.push('---');
  lines.push(`name: ${slug}`);
  lines.push(`version: ${version}`);
  lines.push('description: |');
  lines.push(`  ${description || name}`);
  if (allowedTools.length > 0) {
    lines.push('allowed-tools:');
    for (const tool of allowedTools) {
      lines.push(`  - ${tool}`);
    }
  }
  lines.push('---');
  lines.push('');

  // Title
  lines.push(`# /${slug}`);
  lines.push('');
  if (description) {
    lines.push(description);
    lines.push('');
  }

  // Parameters section
  const paramKeys = Object.keys(parameters);
  if (paramKeys.length > 0) {
    lines.push('## Arguments');
    lines.push('');
    for (const key of paramKeys) {
      const param = parameters[key];
      if (typeof param === 'object' && param !== null) {
        const p = param as Record<string, unknown>;
        const required = p['required'] ? ' (required)' : '';
        const desc = p['description'] ?? '';
        lines.push(`- \`${key}\`${required}: ${desc}`);
      } else {
        lines.push(`- \`${key}\``);
      }
    }
    lines.push('');
  }

  // Node sections
  for (let i = 0; i < orderedNodes.length; i++) {
    const node = orderedNodes[i]!;
    lines.push(`## Step ${i + 1}: ${node.name}`);
    lines.push('');
    lines.push(...projectNode(node));
    lines.push('');
  }

  // Completion
  lines.push('## Completion');
  lines.push('');
  lines.push(
    'Report what was done: status, key outputs, any issues encountered.'
  );
  lines.push('');

  return lines.join('\n');
}

function projectNode(node: {
  description?: string;
  available_tools?: string[];
  trust_required?: string;
  type?: string;
  config?: Record<string, unknown>;
}): string[] {
  const lines: string[] = [];

  // AI-native schema: description + available_tools
  if (!node.type && (node.description ?? node.available_tools)) {
    if (node.description) lines.push(node.description);
    if (node.available_tools && node.available_tools.length > 0) {
      lines.push('');
      lines.push(
        `Tools: ${node.available_tools.map((t) => `\`${t}\``).join(', ')}`
      );
    }
    if (node.trust_required && node.trust_required !== 'auto') {
      lines.push('');
      lines.push(`Trust: ${node.trust_required}`);
    }
    return lines;
  }

  // Legacy schema: type + config
  const config = node.config ?? {};
  switch (node.type) {
    case 'llm_generate': {
      const prompt = config['prompt_template'] as string | undefined;
      if (prompt) lines.push(prompt);
      break;
    }

    case 'tool_call': {
      const toolName = config['tool_name'] as string | undefined;
      const params = config['parameters'] as
        | Record<string, unknown>
        | undefined;
      const approval = config['requiresApproval'] ? ' (requires approval)' : '';

      lines.push(`Run tool: \`${toolName ?? 'unknown'}\`${approval}`);
      if (params && Object.keys(params).length > 0) {
        lines.push('');
        lines.push('```bash');
        lines.push(`# ${toolName}`);
        for (const [k, v] of Object.entries(params)) {
          lines.push(
            `# ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`
          );
        }
        lines.push('```');
      }
      break;
    }

    case 'interpolative': {
      const prompt = config['decision_prompt'] as string | undefined;
      const options = config['options'] as string[] | undefined;

      if (prompt) lines.push(prompt);
      lines.push('');
      if (options) {
        lines.push('Options:');
        for (let i = 0; i < options.length; i++) {
          const letter = String.fromCharCode(65 + i);
          lines.push(`${letter}) ${options[i]}`);
        }
      }
      break;
    }

    case 'sub_entity': {
      const ref = config['entity_ref'] as string | undefined;
      lines.push(`Run \`/${ref ?? 'unknown'}\``);
      break;
    }

    default:
      lines.push(`[Node type: ${node.type}]`);
  }

  return lines;
}

function extractAllowedTools(
  nodes: {
    type?: string;
    config?: Record<string, unknown>;
    available_tools?: string[];
  }[]
): string[] {
  const tools = new Set<string>();

  for (const node of nodes) {
    // AI-native schema: collect from available_tools array
    if (node.available_tools) {
      for (const t of node.available_tools) {
        tools.add(t);
      }
    }

    // Legacy schema: extract from tool_call config
    if (node.type === 'tool_call' && node.config) {
      const toolName = node.config['tool_name'] as string | undefined;
      if (toolName) {
        if (toolName.startsWith('github.') || toolName === 'git') {
          tools.add('Bash');
        } else if (toolName.includes('.')) {
          tools.add(toolName.split('.')[0]!);
        } else {
          tools.add(toolName);
        }
      }
    }
    if (node.type === 'llm_generate' || node.type === 'interpolative') {
      tools.add('Read');
    }
  }

  return [...tools].sort();
}
