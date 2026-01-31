/**
 * @kloudi/shared
 *
 * Shared types, utilities, and constants for the Kloudi platform
 *
 * This package provides cross-cutting functionality:
 * - Common TypeScript types and interfaces for all domains
 * - Utility functions for data manipulation and formatting
 * - Shared constants and enums across the platform
 * - Environment-based configuration management
 * - Structured logging with correlation IDs
 * - Template management for AI prompts
 *
 * Usage Examples:
 *   // Types and interfaces
 *   import { User, Decision, Project } from '@kloudi/shared/types';
 *
 *   // Utility functions
 *   import { formatDate, slugify, generateId } from '@kloudi/shared/utils';
 *
 *   // Constants and enums
 *   import { Priority, DecisionStatus, UserRole } from '@kloudi/shared/constants';
 *
 *   // Configuration management
 *   import { Config } from '@kloudi/shared/config';
 *   const dbUrl = Config.get('DATABASE_URL');
 *
 *   // Logging
 *   import { Logger } from '@kloudi/shared/logger';
 *   const logger = Logger.getInstance('my-module');
 *
 *   // Events (moved to infrastructure)
 *   import { EventBus } from '@kloudi/infrastructure/events';
 *   await EventBus.publish('user.created', userData);
 *
 *   // Prompt templates
 *   import { PromptManager } from '@kloudi/shared/prompt-manager';
 *   const prompt = await PromptManager.getTemplate('code-review');
 */

// ===== TYPE DEFINITIONS =====
// TypeScript interfaces and enums for all domain entities
// Provides type safety across the entire platform
// Renamed from .ts to .js for simplicity
export * from './types/index.js';

// ===== UTILITY FUNCTIONS =====
// Pure functions for data manipulation, formatting, and common operations
// No side effects, fully tested, documented with JSDoc
// Renamed from .ts to .js for simplicity
export * from './utils/index.js';

// ===== CONSTANTS & ENUMS =====
// Platform-wide constants, status values, and enumerations
// Centralized to ensure consistency across all modules
// Renamed from .ts to .js for simplicity
export * from './constants/index.js';

// Export JavaScript modules (no compilation needed)
export * from './config/index.js';
export * from './logger/index.js';
export * from './prompt-manager/index.js';
