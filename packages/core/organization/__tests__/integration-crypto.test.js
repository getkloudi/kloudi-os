import {
  encryptCredentials,
  decryptCredentials,
} from '../../dist/organization/integration-service.js';

const ENCRYPTION_KEY = 'a'.repeat(64);

describe('credential encryption', () => {
  beforeEach(() => {
    process.env['ENCRYPTION_KEY'] = ENCRYPTION_KEY;
  });

  afterEach(() => {
    delete process.env['ENCRYPTION_KEY'];
  });

  test('round-trips credentials through encrypt and decrypt', () => {
    const credentials = { token: 'secret', apiKey: 'abc123' };
    const encrypted = encryptCredentials(credentials);
    const decrypted = decryptCredentials(encrypted);
    expect(decrypted).toEqual(credentials);
  });

  test('produces different ciphertext on each call (random IV)', () => {
    const credentials = { token: 'secret' };
    const enc1 = encryptCredentials(credentials);
    const enc2 = encryptCredentials(credentials);
    expect(enc1).not.toEqual(enc2);
  });

  test('stores as JSON with iv, data, tag fields', () => {
    const encrypted = encryptCredentials({ x: '1' });
    const parsed = JSON.parse(encrypted);
    expect(typeof parsed.iv).toBe('string');
    expect(typeof parsed.data).toBe('string');
    expect(typeof parsed.tag).toBe('string');
  });

  test('throws if ENCRYPTION_KEY is missing', () => {
    delete process.env['ENCRYPTION_KEY'];
    expect(() => encryptCredentials({ x: '1' })).toThrow('ENCRYPTION_KEY');
  });
});
