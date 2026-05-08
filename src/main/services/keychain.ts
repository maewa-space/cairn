import { safeStorage } from 'electron';
import { settingsRepo } from './db.js';

const KEY_PREFIX = 'apikey:';

export type KeyName = 'openai' | 'anthropic';

export function setKey(name: KeyName, value: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage encryption not available on this platform');
  }
  const encrypted = safeStorage.encryptString(value);
  settingsRepo.set(`${KEY_PREFIX}${name}`, encrypted.toString('base64'));
}

export function getKey(name: KeyName): string | null {
  const raw = settingsRepo.get(`${KEY_PREFIX}${name}`);
  if (!raw) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(raw, 'base64'));
  } catch {
    return null;
  }
}

export function hasKey(name: KeyName): boolean {
  return getKey(name) !== null;
}

export function deleteKey(name: KeyName): void {
  settingsRepo.set(`${KEY_PREFIX}${name}`, '');
}
