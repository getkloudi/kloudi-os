/**
 * Shared constants and enums for the Kloudi platform
 */

// API limits and defaults
export const API_LIMITS = {
  MAX_PAGE_SIZE: 100,
  DEFAULT_PAGE_SIZE: 20,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_UPLOAD_FILES: 10,
} as const;

// Cache TTL values (in seconds)
export const CACHE_TTL = {
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes
  LONG: 3600, // 1 hour
  DAY: 86400, // 24 hours
} as const;

// File type categories
export const FILE_TYPES = {
  CODE: [
    '.js',
    '.ts',
    '.jsx',
    '.tsx',
    '.py',
    '.java',
    '.cpp',
    '.c',
    '.go',
    '.rs',
  ],
  CONFIG: ['.json', '.yaml', '.yml', '.toml', '.ini', '.xml'],
  DOCS: ['.md', '.txt', '.doc', '.docx', '.pdf'],
  IMAGES: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'],
  DATA: ['.csv', '.xlsx', '.sql', '.db'],
} as const;

// Priority levels with numeric values
export const PRIORITY_VALUES = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
} as const;

// Status colors for UI
export const STATUS_COLORS = {
  draft: '#6B7280',
  proposed: '#3B82F6',
  approved: '#10B981',
  rejected: '#EF4444',
  implemented: '#8B5CF6',
  active: '#10B981',
  archived: '#6B7280',
  on_hold: '#F59E0B',
} as const;

// Regular expressions
export const REGEX_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  SLUG: /^[a-z0-9-]+$/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  SEMVER:
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
} as const;

// Environment names
export const ENVIRONMENTS = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production',
  TEST: 'test',
} as const;

// HTTP status codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

// Error codes
export const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
} as const;

// Integration-specific constants
export const GITHUB_CONSTANTS = {
  API_BASE: 'https://api.github.com',
  WEBHOOK_EVENTS: ['push', 'pull_request', 'issues', 'release'],
  SCOPES: ['repo', 'user:email', 'read:org'],
} as const;

export const SLACK_CONSTANTS = {
  API_BASE: 'https://slack.com/api',
  WEBHOOK_EVENTS: ['message.channels', 'reaction_added', 'file_shared'],
  SCOPES: ['channels:read', 'channels:history', 'users:read', 'files:read'],
} as const;
