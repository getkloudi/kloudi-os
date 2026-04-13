/**
 * @kloudi/core
 *
 * Core business logic for Decision, Pattern, SOP, and Workspace domains
 *
 * This package provides:
 * - Decision domain with entities, repositories, and services
 * - Pattern domain with template management and instantiation
 * - SOP domain for lore.dev SOPs
 * - Workspace domain for FUSE filesystem management
 *
 * Usage:
 *   import { DecisionService } from '@kloudi/core/decisions';
 *   import { PatternService } from '@kloudi/core/patterns';
 *   import { SopService } from '@kloudi/core/sops';
 *   import { WorkspaceService } from '@kloudi/core/workspace';
 */

export * from './decisions/index.js';
export * from './patterns/index.js';
export * from './sops/index.js';
export * from './workspace/index.js';
export * from './execution/index.js';
export * from './projection/index.js';
export * from './import/index.js';
export * from './organization/index.js';
