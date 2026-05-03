import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export function loadToken(): string | undefined {
  if (process.env['KLOUDI_TOKEN']) {
    return process.env['KLOUDI_TOKEN'];
  }
  const tokenPath = join(homedir(), '.kloudi', 'token');
  try {
    return readFileSync(tokenPath, 'utf-8').trim();
  } catch {
    return undefined;
  }
}
