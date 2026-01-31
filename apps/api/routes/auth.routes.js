/**
 * Authentication API Routes
 *
 * Provides user registration, login, token refresh, and logout endpoints.
 * Uses the JwtManager from @kloudi/auth for token management and
 * the Prisma database for user and session persistence.
 */

import { Auth } from '@kloudi/auth';
import { Database } from '@kloudi/infrastructure/database';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('auth-routes');

/**
 * Email validation regex (RFC 5322 simplified)
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate registration input fields
 *
 * @param {Object} body - Request body with email, username, password
 * @returns {string|null} Error message or null if valid
 */
function validateRegistrationInput({ email, username, password }) {
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
 * @param {Object} body - Request body with email, password
 * @returns {string|null} Error message or null if valid
 */
function validateLoginInput({ email, password }) {
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

export function setupRoutes(app) {
  /**
   * POST /api/auth/register
   *
   * Register a new user account, hash the password, create a session,
   * and return the user info with access and refresh tokens.
   */
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, username, password } = req.body;

      // Validate input
      const validationError = validateRegistrationInput({ email, username, password });
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const db = await Database.getInstance().getClient();

      // Check if email or username already exists
      const existingUser = await db.user.findFirst({
        where: {
          OR: [
            { email: email.toLowerCase() },
            { username },
          ],
        },
      });

      if (existingUser) {
        const field = existingUser.email === email.toLowerCase() ? 'email' : 'username';
        return res.status(409).json({ error: `A user with that ${field} already exists` });
      }

      // Hash the password
      const hashedPassword = await Auth.hashPassword(password);

      // Create the user in the database
      const user = await db.user.create({
        data: {
          email: email.toLowerCase(),
          username,
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
      await db.session.create({
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

      return res.status(201).json({
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
      logger.error('Registration failed', error, {
        context: 'auth-register-error',
      });
      return res.status(500).json({ error: 'Registration failed' });
    }
  });

  /**
   * POST /api/auth/login
   *
   * Authenticate a user with email and password, create a session,
   * and return the user info with access and refresh tokens.
   */
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;

      // Validate input
      const validationError = validateLoginInput({ email, password });
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const db = await Database.getInstance().getClient();

      // Find user by email
      const user = await db.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Compare password
      const passwordMatch = await Auth.comparePassword(password, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ error: 'Invalid credentials' });
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
      await db.session.create({
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

      return res.json({
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
      logger.error('Login failed', error, {
        context: 'auth-login-error',
      });
      return res.status(500).json({ error: 'Login failed' });
    }
  });

  /**
   * POST /api/auth/refresh
   *
   * Exchange a valid refresh token for a new set of access and refresh tokens.
   * The old refresh token is revoked and replaced.
   */
  app.post('/api/auth/refresh', async (req, res) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token is required' });
      }

      // Validate the refresh token
      const decoded = await Auth.validateToken(refreshToken);

      if (decoded.type !== 'refresh') {
        return res.status(401).json({ error: 'Invalid token type' });
      }

      // Generate a new session from the refresh token
      const newSessionData = await Auth.refreshSession(refreshToken);

      const db = await Database.getInstance().getClient();

      // Remove old session and create new one
      await db.session.deleteMany({
        where: { userId: decoded.userId },
      });

      const expiresAt = new Date(Date.now() + newSessionData.expiresIn);
      await db.session.create({
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

      return res.json({
        accessToken: newSessionData.accessToken,
        refreshToken: newSessionData.refreshToken,
        expiresIn: newSessionData.expiresIn,
        tokenType: newSessionData.tokenType,
        sessionId: newSessionData.sessionId,
      });
    } catch (error) {
      logger.error('Token refresh failed', error, {
        context: 'auth-refresh-error',
      });
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
  });

  /**
   * POST /api/auth/logout
   *
   * Revoke the current access token and remove the session from the database.
   * Requires a valid Authorization header with a Bearer token.
   */
  app.post('/api/auth/logout', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const token = authHeader.split(' ')[1];

      // Validate the token and get decoded payload
      let decoded;
      try {
        decoded = await Auth.validateSession(token);
      } catch {
        // Even if the token is invalid/expired, still try to clean up
        return res.json({ message: 'Logged out' });
      }

      // Revoke the token in memory
      if (decoded.jti) {
        Auth.revokeToken(decoded.jti);
      }

      // Remove the session from the database
      const db = await Database.getInstance().getClient();
      await db.session.deleteMany({
        where: { token },
      });

      logger.info('User logged out', {
        context: 'auth-logout',
        userId: decoded.userId,
      });

      return res.json({ message: 'Logged out' });
    } catch (error) {
      logger.error('Logout failed', error, {
        context: 'auth-logout-error',
      });
      // Still return success since the user wants to log out
      return res.json({ message: 'Logged out' });
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
