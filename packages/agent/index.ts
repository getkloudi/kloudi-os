/**
 * @kloudi/agent
 *
 * Agent runtime for executing SOPs (Standard Operating Procedures) in lore.dev
 *
 * This package provides:
 * - AgentRuntime: Core execution engine for SOPs
 * - ContextManager: Manages execution context with token limits
 * - NodeExecutor: Handles individual node type execution
 *
 * Usage:
 *   import { AgentRuntime, ContextManager, NodeExecutor } from '@kloudi/agent';
 *
 *   const runtime = new AgentRuntime({ toolRegistry, aiClient, db });
 *   const result = await runtime.execute(entity, params);
 */

export { AgentRuntime, ExecutionStatus } from './runtime.js';
export { ContextManager, ContextPriority } from './context.js';
export { NodeExecutor } from './executor.js';
