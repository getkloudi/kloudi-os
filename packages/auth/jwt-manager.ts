import jwt from 'jsonwebtoken';
import type { JwtPayload, VerifyOptions } from 'jsonwebtoken';
import type { StringValue } from 'ms';
import bcryptPkg from 'bcrypt';
const bcrypt = bcryptPkg;
import { Config } from '@kloudi/shared/config';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('auth');

/**
 * JWT expiration time type compatible with jsonwebtoken
 */
type JwtExpiresIn = StringValue | number;

/**
 * Configuration interface for JWT Manager
 */
interface JwtConfig {
  jwtSecret: string;
  jwtExpiresIn: JwtExpiresIn;
  bcryptRounds: number;
  issuer: string;
  audience: string;
}

/**
 * Options for initializing JwtManager
 */
interface JwtManagerOptions {
  jwtSecret?: string;
  jwtExpiresIn?: JwtExpiresIn;
  bcryptRounds?: number;
  issuer?: string;
  audience?: string;
}

/**
 * Session data stored for token tracking
 */
interface SessionData {
  userId: string | number;
  createdAt: Date;
  expiresAt: Date;
  type: string;
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

/**
 * Token payload for JWT generation
 */
interface TokenPayload {
  userId?: string | number;
  type?: string;
  permissions?: string[];
  roles?: string[];
  metadata?: Record<string, unknown>;
  password?: string;
  passwordHash?: string;
  iat?: number;
  exp?: number;
  jti?: string;
  [key: string]: unknown;
}

/**
 * Decoded token payload with standard JWT claims
 */
interface DecodedTokenPayload extends JwtPayload {
  userId?: string | number;
  type?: string;
  permissions?: string[];
  roles?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Options for token generation
 */
interface GenerateTokenOptions {
  expiresIn?: JwtExpiresIn | undefined;
  issuer?: string | undefined;
  audience?: string | undefined;
  subject?: string | undefined;
  jwtid?: string | undefined;
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
  type?: string | undefined;
  permissions?: string[] | undefined;
  roles?: string[] | undefined;
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Options for token validation
 */
interface ValidateTokenOptions {
  issuer?: string;
  audience?: string;
  clockTolerance?: number;
}

/**
 * Session creation options
 */
interface CreateSessionOptions {
  permissions?: string[] | undefined;
  roles?: string[] | undefined;
  metadata?: Record<string, unknown> | undefined;
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

/**
 * Session response with tokens
 */
interface SessionResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  sessionId: string;
}

/**
 * Validated session data
 */
interface ValidatedSession {
  userId: string | number;
  permissions: string[];
  roles: string[];
  metadata: Record<string, unknown>;
  issuedAt: Date;
  expiresAt: Date;
}

/**
 * Health check response
 */
interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  canGenerateTokens?: boolean;
  canValidateTokens?: boolean;
  error?: string;
}

/**
 * Time unit multipliers for parsing expiration strings
 */
type TimeUnit = 's' | 'm' | 'h' | 'd';

const TIME_MULTIPLIERS: Record<TimeUnit, number> = {
  s: 1000,
  m: 60000,
  h: 3600000,
  d: 86400000,
};

/**
 * JWT token and session management with bcrypt password handling
 *
 * Provides secure JWT token generation, validation, and password hashing
 * for authentication and authorization in domain applications.
 *
 * Features:
 * - JWT token generation and validation
 * - Secure password hashing with bcrypt
 * - Session management with configurable expiration
 * - Permission and role checking utilities
 * - Token refresh and revocation support
 * - Security best practices enforcement
 *
 * @class JwtManager
 * @description JWT and session management with security best practices
 */
export class JwtManager {
  private static instance: JwtManager | null = null;
  private config: JwtConfig;
  private revokedTokens: Set<string>;
  private sessions: Map<string, SessionData>;

  constructor(options: JwtManagerOptions = {}) {
    this.config = {
      jwtSecret:
        options.jwtSecret ?? (Config.get('auth.jwtSecret') as string) ?? '',
      jwtExpiresIn:
        options.jwtExpiresIn ??
        (Config.get('auth.jwtExpiresIn') as JwtExpiresIn) ??
        '24h',
      bcryptRounds:
        options.bcryptRounds ??
        (Config.get('auth.bcryptRounds') as number) ??
        12,
      issuer: options.issuer ?? 'boilerplate-app',
      audience: options.audience ?? 'boilerplate-users',
    };

    // Validate configuration
    this.validateConfig();

    // Session storage for revocation tracking
    this.revokedTokens = new Set<string>();
    this.sessions = new Map<string, SessionData>();
  }

  /**
   * Get singleton instance
   */
  static getInstance(options: JwtManagerOptions = {}): JwtManager {
    if (!JwtManager.instance) {
      JwtManager.instance = new JwtManager(options);
    }
    return JwtManager.instance;
  }

  /**
   * Validate configuration
   */
  private validateConfig(): void {
    if (
      this.config.jwtSecret === 'development-secret-change-in-production' &&
      Config.isProduction()
    ) {
      throw new Error(
        'SECURITY: Default JWT secret detected in production! Change JWT_SECRET environment variable.'
      );
    }

    if (this.config.jwtSecret.length < 32) {
      throw new Error(
        'JWT secret must be at least 32 characters long for security'
      );
    }

    if (this.config.bcryptRounds < 10) {
      throw new Error('Bcrypt rounds must be at least 10 for security');
    }
  }

  /**
   * Generate JWT token for authenticated user
   *
   * @param payload - Token payload (user data)
   * @param options - Token options
   * @returns Generated JWT token
   */
  async generateToken(
    payload: TokenPayload,
    options: GenerateTokenOptions = {}
  ): Promise<string> {
    try {
      const expiresIn = options.expiresIn ?? this.config.jwtExpiresIn;
      const tokenOptions = {
        expiresIn,
        issuer: options.issuer ?? this.config.issuer,
        audience: options.audience ?? this.config.audience,
        subject: options.subject ?? payload.userId?.toString(),
        jwtid: options.jwtid ?? this.generateJwtId(),
      };

      // Add standard claims
      const tokenPayload: TokenPayload = {
        ...payload,
        iat: Math.floor(Date.now() / 1000),
        type: payload.type ?? 'access',
      };

      // Remove sensitive data from payload
      delete tokenPayload.password;
      delete tokenPayload.passwordHash;

      const token = jwt.sign(tokenPayload, this.config.jwtSecret, tokenOptions);

      // Store session info for revocation tracking
      if (tokenOptions.jwtid) {
        this.sessions.set(tokenOptions.jwtid, {
          userId: payload.userId ?? '',
          createdAt: new Date(),
          expiresAt: new Date(
            Date.now() +
              this.parseExpirationTime(
                tokenOptions.expiresIn ?? this.config.jwtExpiresIn
              )
          ),
          type: tokenPayload.type ?? 'access',
          userAgent: options.userAgent,
          ipAddress: options.ipAddress,
        });
      }

      return token;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Token generation failed: ${errorMessage}`);
    }
  }

  /**
   * Validate and decode JWT token
   *
   * @param token - JWT token to validate
   * @param options - Validation options
   * @returns Decoded token payload
   */
  async validateToken(
    token: string,
    options: ValidateTokenOptions = {}
  ): Promise<DecodedTokenPayload> {
    try {
      const verifyOptions: VerifyOptions = {
        issuer: options.issuer ?? this.config.issuer,
        audience: options.audience ?? this.config.audience,
        clockTolerance: options.clockTolerance ?? 30, // 30 second tolerance
      };

      const decoded = jwt.verify(
        token,
        this.config.jwtSecret,
        verifyOptions
      ) as DecodedTokenPayload;

      // Check if token has been revoked
      if (decoded.jti && this.revokedTokens.has(decoded.jti)) {
        throw new Error('Token has been revoked');
      }

      // Check session validity
      if (decoded.jti && this.sessions.has(decoded.jti)) {
        const session = this.sessions.get(decoded.jti);
        if (session && new Date() > session.expiresAt) {
          this.sessions.delete(decoded.jti);
          throw new Error('Session has expired');
        }
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token has expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      }
      if (error instanceof jwt.NotBeforeError) {
        throw new Error('Token not yet valid');
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Token validation failed: ${errorMessage}`);
    }
  }

  /**
   * Generate refresh token
   *
   * @param payload - Token payload
   * @param options - Token options
   * @returns Refresh token
   */
  async generateRefreshToken(
    payload: TokenPayload,
    options: GenerateTokenOptions = {}
  ): Promise<string> {
    return this.generateToken(
      {
        ...payload,
        type: 'refresh',
      },
      {
        ...options,
        expiresIn: options.expiresIn ?? '7d',
      }
    );
  }

  /**
   * Revoke token by JTI
   *
   * @param jti - JWT ID to revoke
   * @returns Success status
   */
  revokeToken(jti: string): boolean {
    if (!jti) return false;

    this.revokedTokens.add(jti);

    // Remove from active sessions
    if (this.sessions.has(jti)) {
      this.sessions.delete(jti);
    }

    return true;
  }

  /**
   * Revoke all tokens for a user
   *
   * @param userId - User ID
   * @returns Number of tokens revoked
   */
  revokeUserTokens(userId: string | number): number {
    let revokedCount = 0;

    for (const [jti, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        this.revokedTokens.add(jti);
        this.sessions.delete(jti);
        revokedCount++;
      }
    }

    return revokedCount;
  }

  /**
   * Hash password with bcrypt
   *
   * @param password - Plain text password
   * @returns Hashed password
   */
  async hashPassword(password: string): Promise<string> {
    if (!password || typeof password !== 'string') {
      throw new Error('Password must be a non-empty string');
    }

    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    try {
      const salt = await bcrypt.genSalt(this.config.bcryptRounds);
      const hash = await bcrypt.hash(password, salt);
      return hash;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Password hashing failed: ${errorMessage}`);
    }
  }

  /**
   * Compare password with hash
   *
   * @param password - Plain text password
   * @param hash - Hashed password
   * @returns Match status
   */
  async comparePassword(password: string, hash: string): Promise<boolean> {
    if (!password || !hash) {
      return false;
    }

    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      logger.error(
        'Password comparison error:',
        error instanceof Error ? error : undefined
      );
      return false;
    }
  }

  /**
   * Create session for authenticated user
   *
   * @param userId - User ID
   * @param options - Session options
   * @returns Session data with tokens
   */
  async createSession(
    userId: string | number,
    options: CreateSessionOptions = {}
  ): Promise<SessionResponse> {
    const sessionData: TokenPayload = {
      userId,
      permissions: options.permissions ?? [],
      roles: options.roles ?? [],
      metadata: options.metadata ?? {},
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.generateToken(sessionData, {
        ...options,
        type: 'access',
      }),
      this.generateRefreshToken(sessionData, options),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseExpirationTime(this.config.jwtExpiresIn),
      tokenType: 'Bearer',
      sessionId: this.generateJwtId(),
    };
  }

  /**
   * Validate session by token
   *
   * @param token - Access token
   * @returns Session data
   */
  async validateSession(token: string): Promise<ValidatedSession> {
    const decoded = await this.validateToken(token);

    if (decoded.type !== 'access') {
      throw new Error('Invalid token type for session validation');
    }

    return {
      userId: decoded.userId ?? '',
      permissions: decoded.permissions ?? [],
      roles: decoded.roles ?? [],
      metadata: decoded.metadata ?? {},
      issuedAt: new Date((decoded.iat ?? 0) * 1000),
      expiresAt: new Date((decoded.exp ?? 0) * 1000),
    };
  }

  /**
   * Refresh access token using refresh token
   *
   * @param refreshToken - Refresh token
   * @returns New session data
   */
  async refreshSession(refreshToken: string): Promise<SessionResponse> {
    const decoded = await this.validateToken(refreshToken);

    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type for refresh');
    }

    // Revoke the used refresh token
    if (decoded.jti) {
      this.revokeToken(decoded.jti);
    }

    // Generate new session
    return this.createSession(decoded.userId ?? '', {
      permissions: decoded.permissions,
      roles: decoded.roles,
      metadata: decoded.metadata,
    });
  }

  /**
   * Parse expiration time to milliseconds
   */
  parseExpirationTime(expiresIn: string | number): number {
    if (typeof expiresIn === 'number') {
      return expiresIn * 1000;
    }

    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 24 * 60 * 60 * 1000; // Default 24 hours
    }

    const value = match[1];
    const unit = match[2] as TimeUnit;
    if (value === undefined || !(unit in TIME_MULTIPLIERS)) {
      return 24 * 60 * 60 * 1000; // Default 24 hours
    }
    return parseInt(value, 10) * TIME_MULTIPLIERS[unit];
  }

  /**
   * Generate unique JWT ID
   */
  generateJwtId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up expired sessions and revoked tokens
   */
  cleanup(): void {
    const now = new Date();

    // Clean up expired sessions
    for (const [jti, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(jti);
        this.revokedTokens.delete(jti); // Remove from revoked list too
      }
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    try {
      const testPayload: TokenPayload = { userId: 'health-check', test: true };
      const token = await this.generateToken(testPayload, { expiresIn: '1s' });
      const decoded = await this.validateToken(token);

      return {
        status: 'healthy',
        canGenerateTokens: !!token,
        canValidateTokens: decoded.userId === 'health-check',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        status: 'unhealthy',
        error: errorMessage,
      };
    }
  }
}

// Create and export default singleton instance
const defaultManager = JwtManager.getInstance();

// Export the Auth class for backward compatibility with existing templates
export class Auth {
  static getInstance(): JwtManager {
    return defaultManager;
  }

  static async generateToken(
    payload: TokenPayload,
    options: GenerateTokenOptions = {}
  ): Promise<string> {
    return defaultManager.generateToken(payload, options);
  }

  static async validateToken(
    token: string,
    options: ValidateTokenOptions = {}
  ): Promise<DecodedTokenPayload> {
    return defaultManager.validateToken(token, options);
  }

  static async hashPassword(password: string): Promise<string> {
    return defaultManager.hashPassword(password);
  }

  static async comparePassword(
    password: string,
    hash: string
  ): Promise<boolean> {
    return defaultManager.comparePassword(password, hash);
  }

  static async createSession(
    userId: string | number,
    options: CreateSessionOptions = {}
  ): Promise<SessionResponse> {
    return defaultManager.createSession(userId, options);
  }

  static async validateSession(token: string): Promise<ValidatedSession> {
    return defaultManager.validateSession(token);
  }

  static async refreshSession(refreshToken: string): Promise<SessionResponse> {
    return defaultManager.refreshSession(refreshToken);
  }

  static revokeToken(jti: string): boolean {
    return defaultManager.revokeToken(jti);
  }

  static revokeUserTokens(userId: string | number): number {
    return defaultManager.revokeUserTokens(userId);
  }

  static async healthCheck(): Promise<HealthCheckResponse> {
    return defaultManager.healthCheck();
  }
}

export default defaultManager;

// Export types for external use
export type {
  JwtConfig,
  JwtManagerOptions,
  SessionData,
  TokenPayload,
  DecodedTokenPayload,
  GenerateTokenOptions,
  JwtExpiresIn,
  ValidateTokenOptions,
  CreateSessionOptions,
  SessionResponse,
  ValidatedSession,
  HealthCheckResponse,
};
