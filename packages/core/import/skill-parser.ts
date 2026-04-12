/**
 * SKILL.md Parser
 *
 * Parses gstack SKILL.md files into a structured representation.
 */

export interface ParsedSkill {
  frontmatter: {
    name: string;
    version: string;
    description: string;
    allowedTools: string[];
    [key: string]: unknown;
  };
  sections: ParsedSection[];
}

export interface ParsedSection {
  heading: string;
  level: number;
  content: string;
  codeBlocks: { lang: string; code: string }[];
  skillReferences: string[];
  hasDecisionPoint: boolean;
}

export function parseSkillMd(content: string): ParsedSkill {
  const { frontmatter, body } = extractFrontmatter(content);
  const sections = extractSections(body);

  return { frontmatter, sections };
}

function extractFrontmatter(content: string): {
  frontmatter: ParsedSkill['frontmatter'];
  body: string;
} {
  const defaults = { name: '', version: '1.0.0', description: '', allowedTools: [] };

  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: defaults, body: content };
  }

  const yaml = match[1] ?? '';
  const body = match[2] ?? '';
  const fm: Record<string, unknown> = {};

  let currentKey = '';
  let inList = false;
  const listItems: string[] = [];

  for (const line of yaml.split('\n')) {
    const trimmed = line.trim();

    if (inList) {
      if (trimmed.startsWith('- ')) {
        listItems.push(trimmed.slice(2).trim());
        continue;
      } else {
        fm[currentKey] = [...listItems];
        listItems.length = 0;
        inList = false;
      }
    }

    const kvMatch = trimmed.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1] ?? '';
      const value = kvMatch[2] ?? '';
      if (value === '' || value === '|') {
        // Could be a multi-line value or list
        inList = true;
      } else {
        fm[currentKey] = value;
      }
    } else if (currentKey && trimmed && !trimmed.startsWith('-')) {
      // Multi-line string continuation
      const existing = fm[currentKey];
      fm[currentKey] = existing ? `${existing} ${trimmed}` : trimmed;
    }
  }

  if (inList && currentKey) {
    fm[currentKey] = [...listItems];
  }

  return {
    frontmatter: {
      name: String(fm['name'] ?? ''),
      version: String(fm['version'] ?? '1.0.0'),
      description: String(fm['description'] ?? ''),
      allowedTools: Array.isArray(fm['allowed-tools'])
        ? fm['allowed-tools'].map(String)
        : [],
      ...fm,
    },
    body,
  };
}

function extractSections(body: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const lines = body.split('\n');

  let currentSection: ParsedSection | null = null;
  let contentLines: string[] = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockLines: string[] = [];

  const flush = () => {
    if (currentSection) {
      currentSection.content = contentLines.join('\n').trim();
      currentSection.skillReferences = extractSkillRefs(currentSection.content);
      currentSection.hasDecisionPoint = hasDecisionPoint(currentSection.content);
      sections.push(currentSection);
    }
  };

  for (const line of lines) {
    // Code block toggle
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        if (currentSection) {
          currentSection.codeBlocks.push({
            lang: codeBlockLang,
            code: codeBlockLines.join('\n'),
          });
        }
        inCodeBlock = false;
        codeBlockLang = '';
        codeBlockLines = [];
      } else {
        // Start code block
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3).trim();
        codeBlockLines = [];
      }
      contentLines.push(line);
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      contentLines.push(line);
      continue;
    }

    // Section heading
    const headingMatch = line.match(/^(#{2,6})\s+(.+)$/);
    if (headingMatch) {
      flush();
      currentSection = {
        heading: headingMatch[2] ?? '',
        level: (headingMatch[1] ?? '##').length,
        content: '',
        codeBlocks: [],
        skillReferences: [],
        hasDecisionPoint: false,
      };
      contentLines = [];
      continue;
    }

    contentLines.push(line);
  }

  flush();
  return sections;
}

function extractSkillRefs(content: string): string[] {
  const refs = new Set<string>();
  const matches = content.matchAll(/\/([a-z][\w-]*)/g);
  for (const m of matches) {
    const ref = m[1] ?? '';
    // Filter out common false positives
    if (ref && !['api', 'ws', 'health', 'tmp', 'dev', 'usr', 'bin', 'etc'].includes(ref)) {
      refs.add(ref);
    }
  }
  return [...refs];
}

function hasDecisionPoint(content: string): boolean {
  // Check for lettered options: A), B), C) or a), b), c)
  const hasLettered = /^[A-Da-d]\)\s/m.test(content);
  // Check for "Options:" header
  const hasOptionsHeader = /^Options:/mi.test(content);
  return hasLettered || hasOptionsHeader;
}
