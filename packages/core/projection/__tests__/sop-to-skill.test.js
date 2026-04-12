import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let projectToSkillMd;
let walkGraph;

beforeAll(async () => {
  const mod = await import('../../dist/projection/sop-to-skill.js');
  projectToSkillMd = mod.projectToSkillMd;
  const walker = await import('../../dist/projection/graph-walker.js');
  walkGraph = walker.walkGraph;
});

function loadSeedGraph(name) {
  // Resolve from this test file up to the repo root (4 levels: __tests__ → projection → core → packages → root)
  const repoRoot = resolve(__dirname, '..', '..', '..', '..');
  const filePath = resolve(repoRoot, `data/seed/procedures/${name}.json`);
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

describe('walkGraph', () => {
  it('returns nodes in topological order', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ];
    const result = walkGraph(nodes, edges);
    expect(result.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('handles source/target edge format', () => {
    const nodes = [{ id: 'x' }, { id: 'y' }];
    const edges = [{ source: 'x', target: 'y' }];
    const result = walkGraph(nodes, edges);
    expect(result.map((n) => n.id)).toEqual(['x', 'y']);
  });

  it('returns empty for empty input', () => {
    expect(walkGraph([], [])).toEqual([]);
  });
});

describe('projectToSkillMd', () => {
  it('produces valid SKILL.md with frontmatter', () => {
    const proc = loadSeedGraph('engineering-impl');
    const result = projectToSkillMd(proc);

    expect(result).toContain('---');
    expect(result).toContain(`name: ${proc.slug}`);
    expect(result).toContain('version:');
    expect(result).toContain('description:');
    expect(result).toContain(`# /${proc.slug}`);
  });

  it('includes all node names as step headings', () => {
    const proc = loadSeedGraph('engineering-impl');
    const result = projectToSkillMd(proc);

    for (const node of proc.graph.nodes) {
      expect(result).toContain(node.name);
    }
  });

  it('extracts allowed-tools from tool_call nodes', () => {
    const proc = loadSeedGraph('engineering-impl');
    const result = projectToSkillMd(proc);
    expect(result).toContain('allowed-tools:');
  });

  it('generates parameter section when parameters exist', () => {
    const proc = loadSeedGraph('engineering-impl');
    if (Object.keys(proc.parameters || {}).length > 0) {
      const result = projectToSkillMd(proc);
      expect(result).toContain('## Arguments');
    }
  });

  it('is deterministic — same input produces same output', () => {
    const proc = loadSeedGraph('shared-standup');
    const result1 = projectToSkillMd(proc);
    const result2 = projectToSkillMd(proc);
    expect(result1).toBe(result2);
  });

  it('handles interpolative nodes with options', () => {
    const proc = loadSeedGraph('engineering-impl');
    const result = projectToSkillMd(proc);
    // engineering-impl has an interpolative node
    const hasInterpolative = proc.graph.nodes.some(
      (n) => n.type === 'interpolative'
    );
    if (hasInterpolative) {
      expect(result).toContain('Options:');
    }
  });

  it('marks requiresApproval tool calls', () => {
    const proc = loadSeedGraph('engineering-impl');
    const result = projectToSkillMd(proc);
    const hasApproval = proc.graph.nodes.some(
      (n) => n.type === 'tool_call' && n.config?.requiresApproval
    );
    if (hasApproval) {
      expect(result).toContain('requires approval');
    }
  });
});
