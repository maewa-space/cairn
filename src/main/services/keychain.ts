import { safeStorage } from 'electron';
import { settingsRepo } from './db.js';

const KEY_PREFIX = 'apikey:';

export type KeyName = 'openai' | 'anthropic' | 'openrouter';

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
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn(
      `[keychain] safeStorage unavailable; cannot decrypt stored ${name} key. The user will see "key not configured" — they need to re-save the key on a system where the OS keychain is reachable.`,
    );
    return null;
  }
  try {
    return safeStorage.decryptString(Buffer.from(raw, 'base64'));
  } catch (err) {
    // Common causes: OS keychain access revoked, app re-signed under a new
    // identity, or the encrypted blob was corrupted. The caller surfaces
    // "key not set" downstream, which is misleading — log here so the
    // operator can tell the difference in DevTools.
    console.error(
      `[keychain] decrypt failed for "${name}" — stored blob may be corrupt or signed under a different identity:`,
      err,
    );
    return null;
  }
}

export function hasKey(name: KeyName): boolean {
  return getKey(name) !== null;
}

export function deleteKey(name: KeyName): void {
  settingsRepo.set(`${KEY_PREFIX}${name}`, '');
}
