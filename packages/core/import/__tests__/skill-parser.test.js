let parseSkillMd;
let convertToGraph;

beforeAll(async () => {
  const parser = await import('../../dist/import/skill-parser.js');
  parseSkillMd = parser.parseSkillMd;
  const converter = await import('../../dist/import/skill-to-graph.js');
  convertToGraph = converter.convertToGraph;
});

const SAMPLE_SKILL = `---
name: test-skill
version: 1.0.0
description: |
  A test skill for unit tests
allowed-tools:
  - Bash
  - Read
---

# /test-skill

A simple test skill.

## Step 1: Read the code

Look at the source files and understand the structure.

## Step 2: Run tests

\`\`\`bash
pnpm test
\`\`\`

## Step 3: Choose approach

Pick one:
A) Refactor the module
B) Write from scratch
C) Patch the bug

## Step 4: Apply changes

Make the changes and run /review before committing.

## Step 5: Push

\`\`\`bash
git push origin HEAD
\`\`\`
`;

describe('parseSkillMd', () => {
  it('extracts frontmatter fields', () => {
    const result = parseSkillMd(SAMPLE_SKILL);
    expect(result.frontmatter.name).toBe('test-skill');
    expect(result.frontmatter.version).toBe('1.0.0');
    expect(result.frontmatter.description).toContain('test skill');
    expect(result.frontmatter.allowedTools).toEqual(['Bash', 'Read']);
  });

  it('extracts sections by ## headings', () => {
    const result = parseSkillMd(SAMPLE_SKILL);
    expect(result.sections.length).toBe(5);
    expect(result.sections[0].heading).toBe('Step 1: Read the code');
    expect(result.sections[1].heading).toBe('Step 2: Run tests');
  });

  it('detects bash code blocks', () => {
    const result = parseSkillMd(SAMPLE_SKILL);
    const testSection = result.sections[1]; // Step 2: Run tests
    expect(testSection.codeBlocks.length).toBe(1);
    expect(testSection.codeBlocks[0].lang).toBe('bash');
    expect(testSection.codeBlocks[0].code).toContain('pnpm test');
  });

  it('detects decision points', () => {
    const result = parseSkillMd(SAMPLE_SKILL);
    const decisionSection = result.sections[2]; // Step 3: Choose approach
    expect(decisionSection.hasDecisionPoint).toBe(true);
  });

  it('detects skill references', () => {
    const result = parseSkillMd(SAMPLE_SKILL);
    const applySection = result.sections[3]; // Step 4: Apply changes
    expect(applySection.skillReferences).toContain('review');
  });

  it('handles missing frontmatter', () => {
    const result = parseSkillMd('# No Frontmatter\n\n## Section\nContent');
    expect(result.frontmatter.name).toBe('');
    expect(result.frontmatter.allowedTools).toEqual([]);
    expect(result.sections.length).toBe(1);
  });
});

describe('convertToGraph', () => {
  it('converts sections to nodes with sequential edges', () => {
    const parsed = parseSkillMd(SAMPLE_SKILL);
    const result = convertToGraph(parsed);
    expect(result.graph.nodes.length).toBe(5);
    expect(result.graph.edges.length).toBeGreaterThanOrEqual(4);
  });

  it('classifies bash sections as tool_call', () => {
    const parsed = parseSkillMd(SAMPLE_SKILL);
    const result = convertToGraph(parsed);
    const testNode = result.graph.nodes.find(
      (n) => n.name === 'Step 2: Run tests'
    );
    expect(testNode).toBeDefined();
    expect(testNode.type).toBe('tool_call');
  });

  it('classifies decision sections as interpolative', () => {
    const parsed = parseSkillMd(SAMPLE_SKILL);
    const result = convertToGraph(parsed);
    const decisionNode = result.graph.nodes.find(
      (n) => n.name === 'Step 3: Choose approach'
    );
    expect(decisionNode).toBeDefined();
    expect(decisionNode.type).toBe('interpolative');
    expect(decisionNode.config.options).toEqual([
      'Refactor the module',
      'Write from scratch',
      'Patch the bug',
    ]);
  });

  it('sets requiresApproval true for write commands', () => {
    const parsed = parseSkillMd(SAMPLE_SKILL);
    const result = convertToGraph(parsed);
    const pushNode = result.graph.nodes.find((n) => n.name === 'Step 5: Push');
    expect(pushNode).toBeDefined();
    expect(pushNode.type).toBe('tool_call');
    expect(pushNode.config.requiresApproval).toBe(true);
  });

  it('classifies plain text sections as llm_generate', () => {
    const parsed = parseSkillMd(SAMPLE_SKILL);
    const result = convertToGraph(parsed);
    const readNode = result.graph.nodes.find(
      (n) => n.name === 'Step 1: Read the code'
    );
    expect(readNode).toBeDefined();
    expect(readNode.type).toBe('llm_generate');
  });

  it('includes metadata about import source', () => {
    const parsed = parseSkillMd(SAMPLE_SKILL);
    const result = convertToGraph(parsed);
    expect(result.metadata.source).toBe('skill-import');
    expect(result.metadata.originalName).toBe('test-skill');
  });
});
