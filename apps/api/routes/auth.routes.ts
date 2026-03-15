/**
 * Authentication API Routes
 *
 * Provides user registration, login, token refresh, and logout endpoints.
 * Uses the JwtManager from @kloudi/auth for token management and
 * the Prisma database for user and session persistence.
 */

import type { Application, Request, Response } from 'express';
import { Auth } from '@kloudi/auth';
import { Database } from '@kloudi/infrastructure/database';
import { Logger } from '@kloudi/shared/logger';

/** User record from database */
interface UserRecord {
  id: string;
  email: string;
  username: string;
  password: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Session record from database */
interface SessionRecord {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

/** Prisma model methods interface for type-safe database access */
interface DbModel<T = unknown> {
  findMany: (args?: Record<string, unknown>) => Promise<T[]>;
  findUnique: (args: Record<string, unknown>) => Promise<T | null>;
  findFirst: (args?: Record<string, unknown>) => Promise<T | null>;
  create: (args: Record<string, unknown>) => Promise<T>;
  update: (args: Record<string, unknown>) => Promise<T>;
  delete: (args: Record<string, unknown>) => Promise<T>;
  deleteMany: (args?: Record<string, unknown>) => Promise<{ count: number }>;
  upsert: (args: Record<string, unknown>) => Promise<T>;
  count: (args?: Record<string, unknown>) => Promise<number>;
}

const logger = Logger.getInstance('auth-routes');

interface RegistrationInput {
  email: string | undefined;
  username: string | undefined;
  password: string | undefined;
}

interface LoginInput {
  email: string | undefined;
  password: string | undefined;
}

interface DecodedToken {
  userId: string;
  type: string;
  jti?: string;
}

/**
 * Email validation regex (RFC 5322 simplified)
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate registration input fields
 *
 * @param body - Request body with email, username, password
 * @returns Error message or null if valid
 */
function validateRegistrationInput({ email, username, password }: RegistrationInput): string | null {
  if (!email || !username || !password) {
    return 'Email, username, and password are required';
  }

  if (typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
    return 'Invalid email format';
  }

  if (typeof username !== 'string' || username.length < 3 || username.length > 30) {
    return 'Username must be between 3 and 30 characters';
  }

  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters long';
  }

  return null;
}

/**
 * Validate login input fields
 *
 * @param body - Request body with email, password
 * @returns Error message or null if valid
 */
function validateLoginInput({ email, password }: LoginInput): string | null {
  if (!email || !password) {
    return 'Email and password are required';
  }

  if (typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
    return 'Invalid email format';
  }

  if (typeof password !== 'string') {
    return 'Password must be a string';
  }

  return null;
}

export function setupRoutes(app: Application): void {
  /**
   * POST /api/auth/register
   *
   * Register a new user account, hash the password, create a session,
   * and return the user info with access and refresh tokens.
   */
  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const { email, username, password } = req.body as RegistrationInput;

      // Validate input
      const validationError = validateRegistrationInput({ email, username, password });
      if (validationError) {
        res.status(400).json({ error: validationError });
        return;
      }

      // After validation, we know these are defined
      const validEmail = email as string;
      const validUsername = username as string;
      const validPassword = password as string;

      const db = await Database.getInstance().getClient();

      // Check if email or username already exists
      const existingUser = await (db['user'] as DbModel<UserRecord>).findFirst({
        where: {
          OR: [
            { email: validEmail.toLowerCase() },
            { username: validUsername },
          ],
        },
      });

      if (existingUser) {
        const field = existingUser.email === validEmail.toLowerCase() ? 'email' : 'username';
        res.status(409).json({ error: `A user with that ${field} already exists` });
        return;
      }

      // Hash the password
      const hashedPassword = await Auth.hashPassword(validPassword);

      // Create the user in the database
      const user = await (db['user'] as DbModel<UserRecord>).create({
        data: {
          email: validEmail.toLowerCase(),
          username: validUsername,
          password: hashedPassword,
        },
      });

      // Generate a default workspace ID
      const workspaceId = `ws_${user.id}`;

      // Create a session (access + refresh tokens)
      const sessionData = await Auth.createSession(user.id, {
        metadata: {
          email: user.email,
          username: user.username,
          workspaceId,
        },
      });

      // Persist the session in the database
      const expiresAt = new Date(Date.now() + sessionData.expiresIn);
      await (db['session'] as DbModel<SessionRecord>).create({
        data: {
          userId: user.id,
          token: sessionData.accessToken,
          expiresAt,
        },
      });

      logger.info('User registered', {
        context: 'auth-register',
        userId: user.id,
        email: user.email,
        username: user.username,
      });

      res.status(201).json({
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
        },
        accessToken: sessionData.accessToken,
        refreshToken: sessionData.refreshToken,
        expiresIn: sessionData.expiresIn,
        tokenType: sessionData.tokenType,
        sessionId: sessionData.sessionId,
      });
    } catch (error) {
      logger.error('Registration failed', error instanceof Error ? error : null, {
        context: 'auth-register-error',
      });
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  /**
   * POST /api/auth/login
   *
   * Authenticate a user with email and password, create a session,
   * and return the user info with access and refresh tokens.
   */
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body as LoginInput;

      // Validate input
      const validationError = validateLoginInput({ email, password });
      if (validationError) {
        res.status(400).json({ error: validationError });
        return;
      }

      // After validation, we know these are defined
      const validEmail = email as string;
      const validPassword = password as string;

      const db = await Database.getInstance().getClient();

      // Find user by email
      const user = await (db['user'] as DbModel<UserRecord>).findUnique({
        where: { email: validEmail.toLowerCase() },
      });

      if (!user) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      // Compare password
      const passwordMatch = await Auth.comparePassword(validPassword, user.password);
      if (!passwordMatch) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      // Generate a workspace ID
      const workspaceId = `ws_${user.id}`;

      // Create a session (access + refresh tokens)
      const sessionData = await Auth.createSession(user.id, {
        metadata: {
          email: user.email,
          username: user.username,
          workspaceId,
        },
      });

      // Persist the session in the database
      const expiresAt = new Date(Date.now() + sessionData.expiresIn);
      await (db['session'] as DbModel<SessionRecord>).create({
        data: {
          userId: user.id,
          token: sessionData.accessToken,
          expiresAt,
        },
      });

      logger.info('User logged in', {
        context: 'auth-login',
        userId: user.id,
        email: user.email,
      });

      res.json({
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
        },
        accessToken: sessionData.accessToken,
        refreshToken: sessionData.refreshToken,
        expiresIn: sessionData.expiresIn,
        tokenType: sessionData.tokenType,
        sessionId: sessionData.sessionId,
      });
    } catch (error) {
      logger.error('Login failed', error instanceof Error ? error : null, {
        context: 'auth-login-error',
      });
      res.status(500).json({ error: 'Login failed' });
    }
  });

  /**
   * POST /api/auth/refresh
   *
   * Exchange a valid refresh token for a new set of access and refresh tokens.
   * The old refresh token is revoked and replaced.
   */
  app.post('/api/auth/refresh', async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body as { refreshToken?: string };

      if (!refreshToken) {
        res.status(400).json({ error: 'Refresh token is required' });
        return;
      }

      // Validate the refresh token
      const decoded = await Auth.validateToken(refreshToken) as DecodedToken;

      if (decoded.type !== 'refresh') {
        res.status(401).json({ error: 'Invalid token type' });
        return;
      }

      // Generate a new session from the refresh token
      const newSessionData = await Auth.refreshSession(refreshToken);

      const db = await Database.getInstance().getClient();

      // Remove old session and create new one
      await (db['session'] as DbModel<SessionRecord>).deleteMany({
        where: { userId: decoded.userId },
      });

      const expiresAt = new Date(Date.now() + newSessionData.expiresIn);
      await (db['session'] as DbModel<SessionRecord>).create({
        data: {
          userId: decoded.userId,
          token: newSessionData.accessToken,
          expiresAt,
        },
      });

      logger.info('Token refreshed', {
        context: 'auth-refresh',
        userId: decoded.userId,
      });

      res.json({
        accessToken: newSessionData.accessToken,
        refreshToken: newSessionData.refreshToken,
        expiresIn: newSessionData.expiresIn,
        tokenType: newSessionData.tokenType,
        sessionId: newSessionData.sessionId,
      });
    } catch (error) {
      logger.error('Token refresh failed', error instanceof Error ? error : null, {
        context: 'auth-refresh-error',
      });
      res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
  });

  /**
   * POST /api/auth/logout
   *
   * Revoke the current access token and remove the session from the database.
   * Requires a valid Authorization header with a Bearer token.
   */
  app.post('/api/auth/logout', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers['authorization'];

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const token = authHeader.split(' ')[1];
      if (!token) {
        res.json({ message: 'Logged out' });
        return;
      }

      // Validate the token and get decoded payload
      let decoded: DecodedToken;
      try {
        decoded = await Auth.validateSession(token) as unknown as DecodedToken;
      } catch {
        // Even if the token is invalid/expired, still try to clean up
        res.json({ message: 'Logged out' });
        return;
      }

      // Revoke the token in memory
      if (decoded.jti) {
        Auth.revokeToken(decoded.jti);
      }

      // Remove the session from the database
      const db = await Database.getInstance().getClient();
      await (db['session'] as DbModel<SessionRecord>).deleteMany({
        where: { token },
      });

      logger.info('User logged out', {
        context: 'auth-logout',
        userId: decoded.userId,
      });

      res.json({ message: 'Logged out' });
    } catch (error) {
      logger.error('Logout failed', error instanceof Error ? error : null, {
        context: 'auth-logout-error',
      });
      // Still return success since the user wants to log out
      res.json({ message: 'Logged out' });
    }
  });

  logger.info('Auth routes registered', {
    context: 'auth-routes-setup',
    routes: [
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/auth/refresh',
      'POST /api/auth/logout',
    ],
  });
}
