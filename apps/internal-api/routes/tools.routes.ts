import type { Application, Request, Response } from 'express';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('ops-tools');

export function setupToolRoutes(app: Application): void {
  const prefix = '/ops/tools';

  // List registered tools
  // NOTE: Tool registry is in-memory on the product API process.
  // For now, we query what we can from DB/config. When tool registry
  // persists to DB, this becomes a direct query.
  app.get(prefix, async (_req: Request, res: Response) => {
    try {
      // For now, return known integration config from env
      const integrations = [
        { name: 'github', configured: !!process.env['GITHUB_TOKEN'] },
        { name: 'jira', configured: !!process.env['JIRA_API_TOKEN'] },
        { name: 'slack', configured: !!process.env['SLACK_BOT_TOKEN'] },
        {
          name: 'confluence',
          configured: !!process.env['CONFLUENCE_API_TOKEN'],
        },
      ];

      res.json({
        data: integrations,
        note: 'Tool registry is in-memory on the product API. This shows integration config status.',
      });
    } catch (error) {
      logger.error(
        'Failed to list tools',
        error instanceof Error ? error : null,
        {}
      );
      res.status(500).json({ error: 'Failed to list tools' });
    }
  });
}
