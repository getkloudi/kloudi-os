import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

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

export function isEncryptedCredential(value: unknown): boolean {
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

export function safeDecrypt(raw: unknown): Record<string, string> {
  if (typeof raw === 'string' && isEncryptedCredential(raw)) {
    return decryptCredentials(raw);
  }
  if (typeof raw === 'object' && raw !== null) {
    return raw as Record<string, string>;
  }
  return {};
}
