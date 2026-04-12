import type { Application, Request, Response } from 'express';

const GOOGLE_CLIENT_ID = process.env['OPS_GOOGLE_CLIENT_ID'] ?? '';
const GOOGLE_CLIENT_SECRET = process.env['OPS_GOOGLE_CLIENT_SECRET'] ?? '';
const GOOGLE_REDIRECT_URI =
  process.env['OPS_GOOGLE_REDIRECT_URI'] ??
  'http://localhost:3003/auth/callback';

/**
 * Auth routes for Google OAuth flow.
 * These are public — no opsAuthMiddleware applied.
 */
export function setupAuthRoutes(app: Application): void {
  // Initiate Google OAuth
  app.get('/ops/auth/login', (_req: Request, res: Response) => {
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
    });

    res.json({
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    });
  });

  // Exchange authorization code for tokens
  app.post('/ops/auth/callback', async (req: Request, res: Response) => {
    const { code } = req.body as { code?: string };

    if (!code) {
      res.status(400).json({ error: 'Missing authorization code' });
      return;
    }

    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: GOOGLE_REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) {
        const error = await tokenRes.text();
        res
          .status(401)
          .json({ error: 'Token exchange failed', details: error });
        return;
      }

      const tokens = (await tokenRes.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        id_token?: string;
      };

      // Fetch user info
      const userRes = await fetch(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        }
      );

      const user = (await userRes.json()) as {
        email: string;
        name: string;
        picture?: string;
      };

      // Check allowlist
      const allowedEmails = (process.env['OPS_ALLOWED_EMAILS'] ?? '')
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean);
      if (allowedEmails.length > 0 && !allowedEmails.includes(user.email)) {
        res.status(403).json({ error: 'Email not in ops allowlist' });
        return;
      }

      res.json({
        access_token: tokens.access_token,
        expires_in: tokens.expires_in,
        user: {
          email: user.email,
          name: user.name,
          picture: user.picture,
        },
      });
    } catch (error) {
      res.status(500).json({ error: 'OAuth callback failed' });
    }
  });
}
