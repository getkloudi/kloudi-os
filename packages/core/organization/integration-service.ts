import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Database } from '@kloudi/infrastructure/database';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('integration-service');
const ALGORITHM = 'aes-256-gcm';

export interface IntegrationRecord {
  id: string;
  organizationId: string;
  type: string;
  name: string;
  credentials: Record<string, string>;
  config: Record<string, string>;
  status: string;
}

function getEncryptionKey(): Buffer {
  const hex = process.env['ENCRYPTION_KEY'];
  if (!hex) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptCredentials(
  credentials: Record<string, string>
): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(credentials), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('hex'),
    data: encrypted.toString('hex'),
    tag: authTag.toString('hex'),
  });
}

export function decryptCredentials(stored: string): Record<string, string> {
  const parsed = JSON.parse(stored) as {
    iv: string;
    data: string;
    tag: string;
  };
  const key = getEncryptionKey();
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(parsed.iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(parsed.tag, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.data, 'hex')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8')) as Record<string, string>;
}

function isEncrypted(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return (
      typeof parsed['iv'] === 'string' &&
      typeof parsed['data'] === 'string' &&
      typeof parsed['tag'] === 'string'
    );
  } catch {
    return false;
  }
}

function safeDecrypt(raw: unknown): Record<string, string> {
  if (typeof raw === 'string' && isEncrypted(raw)) {
    return decryptCredentials(raw);
  }
  if (typeof raw === 'object' && raw !== null) {
    return raw as Record<string, string>;
  }
  return {};
}

export class IntegrationService {
  async upsertIntegration(
    organizationId: string,
    type: string,
    name: string,
    credentials: Record<string, string>,
    config: Record<string, string> = {}
  ): Promise<IntegrationRecord> {
    const db = await Database.getInstance().getClient();
    const encryptedCredentials = encryptCredentials(credentials);

    const existing = await (db as any).integration.findFirst({
      where: { organizationId, type },
    });

    if (existing) {
      const updated = await (db as any).integration.update({
        where: { id: existing.id },
        data: {
          credentials: encryptedCredentials,
          config,
          name,
          status: 'active',
        },
      });
      logger.info('Integration updated', { orgId: organizationId, type });
      return { ...updated, credentials: safeDecrypt(updated.credentials) };
    }

    const created = await (db as any).integration.create({
      data: {
        organizationId,
        type,
        name,
        credentials: encryptedCredentials,
        config,
      },
    });
    logger.info('Integration created', { orgId: organizationId, type });
    return { ...created, credentials: safeDecrypt(created.credentials) };
  }

  async getCredentialsForOrg(
    organizationId: string
  ): Promise<Record<string, Record<string, string>>> {
    const db = await Database.getInstance().getClient();

    const integrations = await (db as any).integration.findMany({
      where: { organizationId, status: 'active' },
    });

    const result: Record<string, Record<string, string>> = {};
    for (const integration of integrations) {
      result[integration.type] = safeDecrypt(integration.credentials);
    }
    return result;
  }

  async listIntegrations(organizationId: string): Promise<IntegrationRecord[]> {
    const db = await Database.getInstance().getClient();
    const rows = await (db as any).integration.findMany({
      where: { organizationId },
      orderBy: { type: 'asc' },
    });
    return rows.map((r: IntegrationRecord & { credentials: unknown }) => ({
      ...r,
      credentials: safeDecrypt(r.credentials),
    }));
  }
}
