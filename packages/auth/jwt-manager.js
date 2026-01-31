import jwt from 'jsonwebtoken';
import bcryptPkg from 'bcrypt';
const bcrypt = bcryptPkg;
import { Config } from '@kloudi/shared/config';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('auth');

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
  constructor(options = {}) {
    this.config = {
      jwtSecret: options.jwtSecret || Config.get('auth.jwtSecret'),
      jwtExpiresIn: options.jwtExpiresIn || Config.get('auth.jwtExpiresIn'),
      bcryptRounds: options.bcryptRounds || Config.get('auth.bcryptRounds'),
      issuer: options.issuer || 'boilerplate-app',
      audience: options.audience || 'boilerplate-users',
      ...options,
    };

    // Validate configuration
    this.validateConfig();

    // Session storage for revocation tracking
    this.revokedTokens = new Set();
    this.sessions = new Map();
  }

  /**
   * Get singleton instance
   */
  static getInstance(options = {}) {
    if (!JwtManager.instance) {
      JwtManager.instance = new JwtManager(options);
    }
    return JwtManager.instance;
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    if (
      this.config.jwtSecret === 'development-secret-change-in-production' &&
      Config.isProduction()
    ) {
      throw new Error(
        '⚠️  SECURITY: Default JWT secret detected in production! Change JWT_SECRET environment variable.'
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
   * @param {Object} payload - Token payload (user data)
   * @param {Object} options - Token options
   * @returns {Promise<string>} Generated JWT token
   */
  async generateToken(payload, options = {}) {
    try {
      const tokenOptions = {
        expiresIn: options.expiresIn || this.config.jwtExpiresIn,
        issuer: options.issuer || this.config.issuer,
        audience: options.audience || this.config.audience,
        subject: options.subject || payload.userId?.toString(),
        jwtid: options.jwtid || this.generateJwtId(),
      };

      // Add standard claims
      const tokenPayload = {
        ...payload,
        iat: Math.floor(Date.now() / 1000),
        type: payload.type || 'access',
      };

      // Remove sensitive data from payload
      delete tokenPayload.password;
      delete tokenPayload.passwordHash;

      const token = jwt.sign(tokenPayload, this.config.jwtSecret, tokenOptions);

      // Store session info for revocation tracking
      if (tokenOptions.jwtid) {
        this.sessions.set(tokenOptions.jwtid, {
          userId: payload.userId,
          createdAt: new Date(),
          expiresAt: new Date(
            Date.now() + this.parseExpirationTime(tokenOptions.expiresIn)
          ),
          type: tokenPayload.type,
          userAgent: options.userAgent,
          ipAddress: options.ipAddress,
        });
      }

      return token;
    } catch (error) {
      throw new Error(`Token generation failed: ${error.message}`);
    }
  }

  /**
   * Validate and decode JWT token
   *
   * @param {string} token - JWT token to validate
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Decoded token payload
   */
  async validateToken(token, options = {}) {
    try {
      const verifyOptions = {
        issuer: options.issuer || this.config.issuer,
        audience: options.audience || this.config.audience,
        clockTolerance: options.clockTolerance || 30, // 30 second tolerance
        ...options,
      };

      const decoded = jwt.verify(token, this.config.jwtSecret, verifyOptions);

      // Check if token has been revoked
      if (decoded.jti && this.revokedTokens.has(decoded.jti)) {
        throw new Error('Token has been revoked');
      }

      // Check session validity
      if (decoded.jti && this.sessions.has(decoded.jti)) {
        const session = this.sessions.get(decoded.jti);
        if (new Date() > session.expiresAt) {
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
      throw new Error(`Token validation failed: ${error.message}`);
    }
  }

  /**
   * Generate refresh token
   *
   * @param {Object} payload - Token payload
   * @param {Object} options - Token options
   * @returns {Promise<string>} Refresh token
   */
  async generateRefreshToken(payload, options = {}) {
    return this.generateToken(
      {
        ...payload,
        type: 'refresh',
      },
      {
        ...options,
        expiresIn: options.expiresIn || '7d',
      }
    );
  }

  /**
   * Revoke token by JTI
   *
   * @param {string} jti - JWT ID to revoke
   * @returns {boolean} Success status
   */
  revokeToken(jti) {
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
   * @param {string|number} userId - User ID
   * @returns {number} Number of tokens revoked
   */
  revokeUserTokens(userId) {
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
   * @param {string} password - Plain text password
   * @returns {Promise<string>} Hashed password
   */
  async hashPassword(password) {
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
      throw new Error(`Password hashing failed: ${error.message}`);
    }
  }

  /**
   * Compare password with hash
   *
   * @param {string} password - Plain text password
   * @param {string} hash - Hashed password
   * @returns {Promise<boolean>} Match status
   */
  async comparePassword(password, hash) {
    if (!password || !hash) {
      return false;
    }

    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      logger.error('Password comparison error:', error);
      return false;
    }
  }

  /**
   * Create session for authenticated user
   *
   * @param {string|number} userId - User ID
   * @param {Object} options - Session options
   * @returns {Promise<Object>} Session data with tokens
   */
  async createSession(userId, options = {}) {
    const sessionData = {
      userId,
      permissions: options.permissions || [],
      roles: options.roles || [],
      metadata: options.metadata || {},
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
   * @param {string} token - Access token
   * @returns {Promise<Object>} Session data
   */
  async validateSession(token) {
    const decoded = await this.validateToken(token);

    if (decoded.type !== 'access') {
      throw new Error('Invalid token type for session validation');
    }

    return {
      userId: decoded.userId,
      permissions: decoded.permissions || [],
      roles: decoded.roles || [],
      metadata: decoded.metadata || {},
      issuedAt: new Date(decoded.iat * 1000),
      expiresAt: new Date(decoded.exp * 1000),
    };
  }

  /**
   * Refresh access token using refresh token
   *
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object>} New session data
   */
  async refreshSession(refreshToken) {
    const decoded = await this.validateToken(refreshToken);

    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type for refresh');
    }

    // Revoke the used refresh token
    if (decoded.jti) {
      this.revokeToken(decoded.jti);
    }

    // Generate new session
    return this.createSession(decoded.userId, {
      permissions: decoded.permissions,
      roles: decoded.roles,
      metadata: decoded.metadata,
    });
  }

  /**
   * Parse expiration time to milliseconds
   */
  parseExpirationTime(expiresIn) {
    if (typeof expiresIn === 'number') {
      return expiresIn * 1000;
    }

    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 24 * 60 * 60 * 1000; // Default 24 hours
    }

    const [, value, unit] = match;
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return parseInt(value) * multipliers[unit];
  }

  /**
   * Generate unique JWT ID
   */
  generateJwtId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up expired sessions and revoked tokens
   */
  cleanup() {
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
  async healthCheck() {
    try {
      const testPayload = { userId: 'health-check', test: true };
      const token = await this.generateToken(testPayload, { expiresIn: '1s' });
      const decoded = await this.validateToken(token);

      return {
        status: 'healthy',
        canGenerateTokens: !!token,
        canValidateTokens: decoded.userId === 'health-check',
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
      };
    }
  }
}

// Create and export default singleton instance
const defaultManager = JwtManager.getInstance();

// Export the Auth class for backward compatibility with existing templates
export class Auth {
  static getInstance() {
    return defaultManager;
  }

  static async generateToken(payload, options = {}) {
    return defaultManager.generateToken(payload, options);
  }

  static async validateToken(token, options = {}) {
    return defaultManager.validateToken(token, options);
  }

  static async hashPassword(password) {
    return defaultManager.hashPassword(password);
  }

  static async comparePassword(password, hash) {
    return defaultManager.comparePassword(password, hash);
  }

  static async createSession(userId, options = {}) {
    return defaultManager.createSession(userId, options);
  }

  static async validateSession(token) {
    return defaultManager.validateSession(token);
  }

  static async refreshSession(refreshToken) {
    return defaultManager.refreshSession(refreshToken);
  }

  static revokeToken(jti) {
    return defaultManager.revokeToken(jti);
  }

  static revokeUserTokens(userId) {
    return defaultManager.revokeUserTokens(userId);
  }

  static async healthCheck() {
    return defaultManager.healthCheck();
  }
}

export default defaultManager;
