#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Inline logger — this script must run before workspace packages are built,
// so it cannot import from @kloudi-os/shared.
const logger = {
  info: (msg: string, _meta?: Record<string, unknown>) =>
    console.log(`[schema] ${msg}`),
  error: (msg: string, _err?: Error | null, _meta?: Record<string, unknown>) =>
    console.error(`[schema] ${msg}`),
  warn: (msg: string, _meta?: Record<string, unknown>) =>
    console.warn(`[schema] ${msg}`),
  debug: (_msg: string, _meta?: Record<string, unknown>) => {},
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Schema file information */
interface SchemaFile {
  path: string;
  domain: string;
  content: string;
}

/** Build result information */
interface BuildResult {
  outputFile: string;
  domains: string[];
  totalModels: number;
}

class PrismaSchemaBuilder {
  private apiSrcDir: string;
  private rootDir: string;
  private outputFile: string;

  constructor() {
    // When running from dist/, __dirname is packages/infrastructure/dist/database
    // When running from source, __dirname is packages/infrastructure/database
    // We need to resolve to the monorepo root correctly
    const isInDist = __dirname.includes('/dist/');
    const levelsUp = isInDist ? 4 : 3; // dist adds one extra level

    this.rootDir = path.resolve(__dirname, ...Array(levelsUp).fill('..'));
    this.apiSrcDir = path.join(this.rootDir, 'apps', 'api');
    this.outputFile = path.join(this.rootDir, 'schema.prisma');
  }

  // Read the generator and datasource configuration
  getSchemaHeader(): string {
    return `// ===========================================
// GENERATED SCHEMA - DO NOT EDIT DIRECTLY
// ===========================================
// This file is auto-generated from domain schemas.
// Edit individual domain schema.prisma files instead.
// Run: pnpm build:schema to regenerate.

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

`;
  }

  // Find all schema.prisma files in packages and apps
  findSchemaFiles(): SchemaFile[] {
    const schemaFiles: SchemaFile[] = [];

    // Scan packages/*/prisma/schema.prisma
    const packagesDir = path.join(this.rootDir, 'packages');
    if (fs.existsSync(packagesDir)) {
      const packages = fs.readdirSync(packagesDir).filter((item) => {
        const itemPath = path.join(packagesDir, item);
        return fs.statSync(itemPath).isDirectory() && !item.startsWith('.');
      });

      packages.forEach((pkg) => {
        const schemaPath = path.join(
          packagesDir,
          pkg,
          'prisma',
          'schema.prisma'
        );
        if (fs.existsSync(schemaPath)) {
          schemaFiles.push({
            path: schemaPath,
            domain: `packages/${pkg}`,
            content: fs.readFileSync(schemaPath, 'utf8'),
          });
          logger.info(`   Found package schema: ${pkg}`, { package: pkg });
        }
      });
    }

    // Scan apps/*/prisma/schema.prisma (excluding apps/api and apps/auth)
    // apps/auth owns its own self-contained Prisma schema + client. It is
    // intentionally excluded from the aggregated root schema so the auth
    // service can be extracted to its own repo without rewiring the build.
    const appsDir = path.join(this.rootDir, 'apps');
    if (fs.existsSync(appsDir)) {
      const apps = fs.readdirSync(appsDir).filter((item) => {
        const itemPath = path.join(appsDir, item);
        return (
          fs.statSync(itemPath).isDirectory() &&
          !item.startsWith('.') &&
          item !== 'api' && // Exclude apps/api
          item !== 'auth' // Exclude apps/auth (self-contained)
        );
      });

      apps.forEach((app) => {
        const schemaPath = path.join(appsDir, app, 'prisma', 'schema.prisma');
        if (fs.existsSync(schemaPath)) {
          schemaFiles.push({
            path: schemaPath,
            domain: `apps/${app}`,
            content: fs.readFileSync(schemaPath, 'utf8'),
          });
          logger.info(`   Found app schema: ${app}`, { app });
        }
      });
    }

    return schemaFiles;
  }

  // Clean schema content (remove comments, empty lines at start/end)
  cleanSchemaContent(content: string, domain: string): string {
    // Remove generator and datasource blocks from individual schemas
    let cleaned = content
      .replace(/generator\s+\w+\s*\{[^}]*\}/gs, '')
      .replace(/datasource\s+\w+\s*\{[^}]*\}/gs, '');

    // Clean up extra whitespace
    cleaned = cleaned.trim();

    if (!cleaned) {
      return '';
    }

    // Add domain header
    return `
// ===========================================
// ${domain.toUpperCase()} DOMAIN
// ===========================================

${cleaned}
`;
  }

  // Build the complete schema
  buildSchema(): BuildResult {
    logger.info('Building Prisma schema...', {
      context: 'schema-build-start',
    });
    // eslint-disable-next-line no-console -- User-facing CLI build output
    console.log('Building Prisma schema...');

    const schemaFiles = this.findSchemaFiles();
    logger.info(`Found ${schemaFiles.length} schema files`, {
      count: schemaFiles.length,
    });
    // eslint-disable-next-line no-console -- User-facing CLI build output
    console.log(`Found ${schemaFiles.length} schema files`);

    let fullSchema = this.getSchemaHeader();

    schemaFiles.forEach(({ domain, content }) => {
      logger.info(`   Adding ${domain} schema`, { domain });
      // eslint-disable-next-line no-console -- User-facing CLI build output
      console.log(`   Adding ${domain} schema`);
      const cleanedContent = this.cleanSchemaContent(content, domain);
      if (cleanedContent) {
        fullSchema += cleanedContent + '\n';
      }
    });

    // Write the combined schema
    fs.writeFileSync(this.outputFile, fullSchema);
    logger.info(`Schema built successfully: ${this.outputFile}`, {
      outputFile: this.outputFile,
    });
    // eslint-disable-next-line no-console -- User-facing CLI build output
    console.log(`Schema built successfully: ${this.outputFile}`);

    return {
      outputFile: this.outputFile,
      domains: schemaFiles.map((f) => f.domain),
      totalModels: this.countModels(fullSchema),
    };
  }

  // Count models in the schema
  countModels(schema: string): number {
    const modelMatches = schema.match(/model\s+\w+/g);
    return modelMatches ? modelMatches.length : 0;
  }

  // Validate the built schema
  validateSchema(): boolean {
    if (!fs.existsSync(this.outputFile)) {
      throw new Error('Schema file not found. Run build first.');
    }

    const schema = fs.readFileSync(this.outputFile, 'utf8');

    // Basic validation checks
    const checks = {
      hasGenerator: schema.includes('generator client'),
      hasDatasource: schema.includes('datasource db'),
      hasModels: /model\s+\w+/.test(schema),
      noDuplicateModels: this.checkForDuplicateModels(schema),
    };

    const errors: string[] = [];
    if (!checks.hasGenerator) errors.push('Missing generator block');
    if (!checks.hasDatasource) errors.push('Missing datasource block');
    if (!checks.noDuplicateModels)
      errors.push('Duplicate model names detected');

    // Warn if no models, but don't fail (allows empty schema during initial setup)
    if (!checks.hasModels) {
      logger.warn('No models found in schema (this is OK for initial setup)', {
        context: 'schema-validation-warning',
      });
    }

    if (errors.length > 0) {
      throw new Error(`Schema validation failed: ${errors.join(', ')}`);
    }

    logger.info('Schema validation passed', {
      context: 'schema-validation-success',
    });
    // eslint-disable-next-line no-console -- User-facing CLI validation output
    console.log('Schema validation passed');
    return true;
  }

  // Check for duplicate model names
  checkForDuplicateModels(schema: string): boolean {
    const modelNames: string[] = [];
    const modelMatches = schema.match(/model\s+(\w+)/g);

    if (!modelMatches) return true;

    for (const match of modelMatches) {
      const name = match.replace('model ', '');
      if (modelNames.includes(name)) {
        logger.error(`Duplicate model found: ${name}`, null, {
          modelName: name,
        });
        // eslint-disable-next-line no-console -- User-facing CLI error output
        console.error(`Duplicate model found: ${name}`);
        return false;
      }
      modelNames.push(name);
    }

    return true;
  }

  // Watch for changes in schema files
  watchSchemas(): void {
    logger.info('Watching for schema changes...', {
      context: 'schema-watcher-start',
    });
    // eslint-disable-next-line no-console -- User-facing CLI watcher output
    console.log('Watching for schema changes...');

    const schemaFiles = this.findSchemaFiles();
    schemaFiles.forEach(({ path: filePath }) => {
      fs.watchFile(filePath, () => {
        logger.info(`Schema change detected: ${filePath}`, { filePath });
        // eslint-disable-next-line no-console -- User-facing CLI watcher output
        console.log(`Schema change detected: ${filePath}`);
        this.buildSchema();
      });
    });

    // eslint-disable-next-line no-console -- User-facing CLI instruction
    console.log('Press Ctrl+C to stop watching');
  }

  // Generate domain schema template
  generateDomainSchemaTemplate(domainName: string): string {
    const DomainName = domainName.charAt(0).toUpperCase() + domainName.slice(1);

    return `// ===========================================
// ${domainName.toUpperCase()} DOMAIN SCHEMA
// ===========================================
// Define ${domainName}-specific models here.
// This file will be concatenated with shared schema.

model ${DomainName} {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Add ${domainName}-specific fields here

  @@map("${domainName}s")
}

// Add additional ${domainName}-related models here
`;
  }

  // Create schema file for a domain
  createDomainSchema(domainName: string): boolean {
    const domainSchemaPath = path.join(
      this.apiSrcDir,
      domainName,
      'schema.prisma'
    );

    if (fs.existsSync(domainSchemaPath)) {
      logger.info(`Schema already exists for domain: ${domainName}`, {
        domainName,
      });
      // eslint-disable-next-line no-console -- User-facing CLI warning
      console.log(`Schema already exists for domain: ${domainName}`);
      return false;
    }

    const template = this.generateDomainSchemaTemplate(domainName);
    fs.writeFileSync(domainSchemaPath, template);
    logger.info(`Created schema for domain: ${domainName}`, { domainName });
    // eslint-disable-next-line no-console -- User-facing CLI success output
    console.log(`Created schema for domain: ${domainName}`);
    return true;
  }

  // Main execution
  run(): void {
    const args = process.argv.slice(2);
    const command = args[0];

    try {
      switch (command) {
        case 'build': {
          const result = this.buildSchema();
          this.validateSchema();
          logger.info(`\nSummary:`, {
            domains: result.domains,
            models: result.totalModels,
          });
          // eslint-disable-next-line no-console -- User-facing CLI summary output
          console.log(`\nSummary:`);
          // eslint-disable-next-line no-console -- User-facing CLI summary output
          console.log(`   Domains: ${result.domains.join(', ')}`);
          // eslint-disable-next-line no-console -- User-facing CLI summary output
          console.log(`   Models: ${result.totalModels}`);
          break;
        }

        case 'watch':
          this.buildSchema();
          this.watchSchemas();
          break;

        case 'validate':
          this.validateSchema();
          break;

        case 'create': {
          const domainName = args[1];
          if (!domainName) {
            logger.error(
              'Domain name required: pnpm build:schema create <domain>'
            );
            // eslint-disable-next-line no-console -- User-facing CLI error output
            console.error(
              'Domain name required: pnpm build:schema create <domain>'
            );
            process.exit(1);
          }
          this.createDomainSchema(domainName);
          break;
        }

        default:
          // eslint-disable-next-line no-console -- User-facing CLI help output
          console.log('Usage:');
          // eslint-disable-next-line no-console -- User-facing CLI help output
          console.log('  pnpm build:schema build     - Build combined schema');
          // eslint-disable-next-line no-console -- User-facing CLI help output
          console.log(
            '  pnpm build:schema watch     - Watch for changes and rebuild'
          );
          // eslint-disable-next-line no-console -- User-facing CLI help output
          console.log('  pnpm build:schema validate  - Validate built schema');
          // eslint-disable-next-line no-console -- User-facing CLI help output
          console.log(
            '  pnpm build:schema create <domain> - Create domain schema template'
          );
          break;
      }
    } catch (error) {
      const err = error as Error;
      logger.error('Error:', err, { context: 'schema-build-error' });
      // eslint-disable-next-line no-console -- User-facing CLI error output
      console.error('Error:', err.message);
      process.exit(1);
    }
  }
}

// Run the schema builder
const builder = new PrismaSchemaBuilder();
builder.run();
