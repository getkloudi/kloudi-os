/**
 * IntegrationService — CRUD for per-org integrations (tool credentials).
 */

import { Database } from '@kloudi/infrastructure/database';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('integration-service');

export interface IntegrationRecord {
  id: string;
  organizationId: string;
  type: string;
  name: string;
  credentials: Record<string, string>;
  config: Record<string, string>;
  status: string;
}

export class IntegrationService {
  async upsertIntegration(
    organizationId: string,
    type: string,
    name: string,
    credentials: Record<string, string>,
    config: Record<string, string> = {},
  ): Promise<IntegrationRecord> {
    const db = await Database.getInstance().getClient();

    const existing = await (db as any).integration.findFirst({
      where: { organizationId, type },
    });

    if (existing) {
      const updated = await (db as any).integration.update({
        where: { id: existing.id },
        data: { credentials, config, name, status: 'active' },
      });
      logger.info('Integration updated', { orgId: organizationId, type });
      return updated;
    }

    const created = await (db as any).integration.create({
      data: { organizationId, type, name, credentials, config },
    });
    logger.info('Integration created', { orgId: organizationId, type });
    return created;
  }

  async getCredentialsForOrg(
    organizationId: string,
  ): Promise<Record<string, Record<string, string>>> {
    const db = await Database.getInstance().getClient();

    const integrations = await (db as any).integration.findMany({
      where: { organizationId, status: 'active' },
    });

    const result: Record<string, Record<string, string>> = {};
    for (const integration of integrations) {
      result[integration.type] = integration.credentials as Record<string, string>;
    }
    return result;
  }

  async listIntegrations(organizationId: string): Promise<IntegrationRecord[]> {
    const db = await Database.getInstance().getClient();
    return (db as any).integration.findMany({
      where: { organizationId },
      orderBy: { type: 'asc' },
    });
  }
}
