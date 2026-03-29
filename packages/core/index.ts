/**
 * @kloudi/core
 *
 * Core business logic for Decision, Pattern, Procedure, and Workspace domains
 *
 * This package provides:
 * - Decision domain with entities, repositories, and services
 * - Pattern domain with template management and instantiation
 * - Procedure domain for lore.dev procedural entities
 * - Workspace domain for FUSE filesystem management
 *
 * Usage:
 *   import { DecisionService } from '@kloudi/core/decisions';
 *   import { PatternService } from '@kloudi/core/patterns';
 *   import { ProcedureService } from '@kloudi/core/procedures';
 *   import { WorkspaceService } from '@kloudi/core/workspace';
 */

export * from './decisions/index.js';
export * from './patterns/index.js';
export * from './procedures/index.js';
export * from './workspace/index.js';
export * from './execution/index.js';
