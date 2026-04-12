/**
 * Database Seed Script
 *
 * Populates the database with initial procedure data that was previously
 * hardcoded in the frontend mock data.
 *
 * Run with: pnpm db:seed
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Seed procedure data interface
 */
interface SeedProcedure {
  slug: string;
  name: string;
  description: string;
  level: string;
  maturity: string;
  graph: {
    content: string;
    nodes: unknown[];
    edges: unknown[];
  };
  parameters: Record<string, unknown>;
  constraints: Record<string, unknown>;
  workspaceId: string;
}

/**
 * Prisma procedure record
 */
interface ProcedureRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  level: string;
  maturity: string;
  graph: unknown;
  parameters: unknown;
  constraints: unknown;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Prisma client interface for seed operations
 */
interface SeedPrismaClient {
  $connect: () => Promise<void>;
  $disconnect: () => Promise<void>;
  procedure: {
    findFirst: (args: {
      where: { workspaceId: string; slug: string };
    }) => Promise<ProcedureRecord | null>;
    create: (args: {
      data: {
        slug: string;
        name: string;
        description: string;
        level: string;
        maturity: string;
        graph: unknown;
        parameters: unknown;
        constraints: unknown;
        workspaceId: string;
      };
    }) => Promise<ProcedureRecord>;
    update: (args: {
      where: { id: string };
      data: {
        name: string;
        description: string;
        level: string;
        maturity: string;
        graph: unknown;
        parameters: unknown;
        constraints: unknown;
      };
    }) => Promise<ProcedureRecord>;
    count: (args: { where: { workspaceId: string } }) => Promise<number>;
  };
}

// Load .env file manually (avoids dotenv dependency)
function loadEnvFile(): void {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  // Walk up to find monorepo root (.env file)
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const envPath = path.join(dir, '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        // Strip surrounding quotes
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
      return;
    }
    dir = path.dirname(dir);
  }
}

loadEnvFile();

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const WORKSPACE_ID = 'default-workspace';

const seedProcedures: SeedProcedure[] = [
  // Guides
  {
    slug: 'code-review-patterns',
    name: 'Code Review Patterns',
    description: 'Best practices for conducting effective code reviews',
    level: 'guide',
    maturity: 'curated',
    graph: {
      content: `# Code Review Patterns

## Overview
This guide covers patterns for effective code reviews.

## Key Principles
1. Review the code, not the author
2. Focus on logic and security issues first
3. Suggest improvements, don't demand them
4. Keep reviews small and focused

## Checklist
- [ ] Security vulnerabilities
- [ ] Error handling
- [ ] Test coverage
- [ ] Documentation`,
      nodes: [],
      edges: [],
    },
    parameters: {},
    constraints: {},
    workspaceId: WORKSPACE_ID,
  },
  {
    slug: 'typescript-best-practices',
    name: 'TypeScript Best Practices',
    description: 'Guidelines for writing clean, type-safe TypeScript code',
    level: 'guide',
    maturity: 'curated',
    graph: {
      content: `# TypeScript Best Practices

## Overview
A comprehensive guide to writing maintainable TypeScript code.

## Key Practices
1. Use strict mode and enable all strict compiler options
2. Prefer interfaces over type aliases for object shapes
3. Use discriminated unions for state management
4. Leverage generics for reusable, type-safe code
5. Avoid \`any\` - use \`unknown\` when type is uncertain

## Common Patterns
- Builder pattern with method chaining
- Result types for error handling
- Branded types for domain primitives`,
      nodes: [],
      edges: [],
    },
    parameters: {},
    constraints: {},
    workspaceId: WORKSPACE_ID,
  },
  {
    slug: 'api-design-guidelines',
    name: 'API Design Guidelines',
    description: 'Standards for designing consistent REST and GraphQL APIs',
    level: 'guide',
    maturity: 'curated',
    graph: {
      content: `# API Design Guidelines

## Overview
Standards and conventions for building consistent, developer-friendly APIs.

## REST Conventions
1. Use nouns for resource URLs, not verbs
2. Use HTTP methods correctly (GET, POST, PUT, DELETE)
3. Return appropriate status codes
4. Support pagination, filtering, and sorting
5. Version your APIs

## Response Format
- Always wrap responses in a data envelope
- Include pagination metadata
- Use consistent error response format`,
      nodes: [],
      edges: [],
    },
    parameters: {},
    constraints: {},
    workspaceId: WORKSPACE_ID,
  },

  // Skills
  {
    slug: 'create-react-component',
    name: 'Create React Component',
    description: 'Generate a new React component with TypeScript and tests',
    level: 'skill',
    maturity: 'validated',
    graph: {
      content: `// Skill: Create React Component
// This skill generates a new React component

Parameters:
- name: Component name (PascalCase)
- path: Target directory
- withTests: Generate test file (default: true)
- withStyles: Generate CSS module (default: false)

Template:
\`\`\`tsx
interface {{name}}Props {
  // Add props here
}

export function {{name}}({ ...props }: {{name}}Props) {
  return (
    <div>
      {/* Component content */}
    </div>
  );
}
\`\`\``,
      nodes: [],
      edges: [],
    },
    parameters: {
      name: {
        type: 'string',
        required: true,
        description: 'Component name in PascalCase',
      },
      path: {
        type: 'string',
        required: false,
        description: 'Target directory',
      },
      withTests: {
        type: 'boolean',
        default: true,
        description: 'Generate test file',
      },
      withStyles: {
        type: 'boolean',
        default: false,
        description: 'Generate CSS module',
      },
    },
    constraints: {},
    workspaceId: WORKSPACE_ID,
  },
  {
    slug: 'write-unit-tests',
    name: 'Write Unit Tests',
    description: 'Generate unit tests for an existing module or function',
    level: 'skill',
    maturity: 'validated',
    graph: {
      content: `// Skill: Write Unit Tests
// This skill generates unit tests for existing code

Parameters:
- target: Path to the file to test
- framework: Testing framework (jest, vitest, mocha)
- coverage: Target coverage percentage

Process:
1. Analyze the target file for exported functions and classes
2. Identify edge cases and boundary conditions
3. Generate test cases with descriptive names
4. Include setup and teardown as needed
5. Add mocks for external dependencies`,
      nodes: [],
      edges: [],
    },
    parameters: {
      target: {
        type: 'string',
        required: true,
        description: 'Path to file to test',
      },
      framework: {
        type: 'string',
        default: 'jest',
        description: 'Testing framework',
      },
      coverage: {
        type: 'number',
        default: 80,
        description: 'Target coverage percentage',
      },
    },
    constraints: {},
    workspaceId: WORKSPACE_ID,
  },
  {
    slug: 'generate-api-endpoint',
    name: 'Generate API Endpoint',
    description: 'Scaffold a new REST API endpoint with validation and tests',
    level: 'skill',
    maturity: 'validated',
    graph: {
      content: `// Skill: Generate API Endpoint
// This skill scaffolds a complete REST API endpoint

Parameters:
- resource: Resource name (e.g., "users", "posts")
- methods: HTTP methods to generate (GET, POST, PUT, DELETE)
- auth: Require authentication (default: true)

Generated Files:
1. Route handler with Express middleware
2. Request validation schemas
3. Controller with business logic
4. Integration tests
5. API documentation`,
      nodes: [],
      edges: [],
    },
    parameters: {
      resource: {
        type: 'string',
        required: true,
        description: 'Resource name',
      },
      methods: {
        type: 'array',
        default: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'HTTP methods',
      },
      auth: {
        type: 'boolean',
        default: true,
        description: 'Require authentication',
      },
    },
    constraints: {},
    workspaceId: WORKSPACE_ID,
  },

  // Project
  {
    slug: 'craft-clone',
    name: 'Craft Clone',
    description:
      'Build a Craft-like document editor as an Electron application',
    level: 'project',
    maturity: 'draft',
    graph: {
      content: `# Project: Craft Clone

## Overview
Build a Craft-like document editor as a desktop application using Electron.

## Architecture
- Electron for cross-platform desktop app
- React for the renderer process UI
- Local-first with SQLite storage
- Real-time collaboration via WebRTC

## Milestones
1. Scaffold Electron App
2. Build Session Inbox UI
3. Implement Local Storage
4. Add Rich Text Editor
5. Enable Collaboration`,
      nodes: [],
      edges: [],
    },
    parameters: {},
    constraints: {},
    workspaceId: WORKSPACE_ID,
  },

  // Tasks (children of the project)
  {
    slug: 'scaffold-electron-app',
    name: 'Scaffold Electron App',
    description: 'Set up the initial Electron application structure',
    level: 'task',
    maturity: 'draft',
    graph: {
      content: `# Task: Scaffold Electron App

## Objective
Create the initial Electron application structure with:
- Main process entry point
- Preload scripts
- Renderer process setup
- IPC communication layer

## Steps
1. Initialize Electron project
2. Configure build system
3. Set up hot reload for development
4. Add basic window management

## Dependencies
- electron: ^28.0.0
- electron-builder: ^24.0.0`,
      nodes: [],
      edges: [],
    },
    parameters: {},
    constraints: {},
    workspaceId: WORKSPACE_ID,
  },
  {
    slug: 'build-session-inbox-ui',
    name: 'Build Session Inbox UI',
    description: 'Create the session inbox interface for managing documents',
    level: 'task',
    maturity: 'draft',
    graph: {
      content: `# Task: Build Session Inbox UI

## Objective
Design and implement the session inbox where users can:
- View recent documents
- Create new sessions
- Search and filter documents
- Organize with folders and tags

## Components
1. InboxView - Main list of sessions
2. SessionCard - Individual session preview
3. SearchBar - Full-text search
4. FilterPanel - Category and tag filters`,
      nodes: [],
      edges: [],
    },
    parameters: {},
    constraints: {},
    workspaceId: WORKSPACE_ID,
  },
  {
    slug: 'implement-local-storage',
    name: 'Implement Local Storage',
    description:
      'Set up SQLite-based local storage for offline-first operation',
    level: 'task',
    maturity: 'draft',
    graph: {
      content: `# Task: Implement Local Storage

## Objective
Set up a local-first data layer using SQLite for:
- Document persistence
- Session state management
- Offline operation support
- Sync queue for when online

## Technical Design
- Use better-sqlite3 for Node.js SQLite bindings
- Implement a migration system
- Add CRDT support for conflict resolution
- Build sync queue for eventual consistency`,
      nodes: [],
      edges: [],
    },
    parameters: {},
    constraints: {},
    workspaceId: WORKSPACE_ID,
  },
];

async function seed(): Promise<void> {
  console.log('Seeding database...');

  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma = new (PrismaClient as unknown as new (options: {
    adapter: typeof adapter;
  }) => SeedPrismaClient)({ adapter });

  try {
    await prisma.$connect();
    console.log('Connected to database');

    // Upsert each procedure (idempotent - safe to run multiple times)
    for (const proc of seedProcedures) {
      const existing = await prisma.procedure.findFirst({
        where: {
          workspaceId: proc.workspaceId,
          slug: proc.slug,
        },
      });

      if (existing) {
        await prisma.procedure.update({
          where: { id: existing.id },
          data: {
            name: proc.name,
            description: proc.description,
            level: proc.level,
            maturity: proc.maturity,
            graph: proc.graph,
            parameters: proc.parameters,
            constraints: proc.constraints,
          },
        });
        console.log(`  Updated: ${proc.name} (${proc.level})`);
      } else {
        await prisma.procedure.create({
          data: {
            slug: proc.slug,
            name: proc.name,
            description: proc.description,
            level: proc.level,
            maturity: proc.maturity,
            graph: proc.graph,
            parameters: proc.parameters,
            constraints: proc.constraints,
            workspaceId: proc.workspaceId,
          },
        });
        console.log(`  Created: ${proc.name} (${proc.level})`);
      }
    }

    // Verify
    const count = await prisma.procedure.count({
      where: { workspaceId: WORKSPACE_ID },
    });
    console.log(`\nSeed complete. Total procedures in workspace: ${count}`);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
