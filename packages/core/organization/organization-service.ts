/**
 * OrganizationService — creates orgs, memberships, and looks up org context.
 */

import { Database } from '@kloudi/infrastructure/database';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('organization-service');

export class OrganizationService {
  async createOrganization(
    name: string,
    slug: string,
    ownerUserId?: string
  ): Promise<{ id: string; slug: string }> {
    const db = await Database.getInstance().getClient();

    const existing = await (db as any).organization.findFirst({
      where: { slug },
    });
    if (existing) {
      return { id: existing.id, slug: existing.slug };
    }

    const org = await (db as any).organization.create({
      data: { name, slug },
    });

    if (ownerUserId) {
      await (db as any).membership.create({
        data: {
          userId: ownerUserId,
          organizationId: org.id,
          role: 'owner',
        },
      });
    }

    logger.info('Organization created', { orgId: org.id, slug });
    return { id: org.id, slug: org.slug };
  }

  async getOrganizationForUser(
    userId: string
  ): Promise<{ id: string; slug: string } | null> {
    const db = await Database.getInstance().getClient();

    const membership = await (db as any).membership.findFirst({
      where: { userId },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!membership) return null;
    return {
      id: membership.organization.id,
      slug: membership.organization.slug,
    };
  }

  async getOrganization(
    id: string
  ): Promise<{ id: string; name: string; slug: string } | null> {
    const db = await Database.getInstance().getClient();
    return (db as any).organization.findUnique({ where: { id } });
  }
}
