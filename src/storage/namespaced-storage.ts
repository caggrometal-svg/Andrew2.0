import type { StorageProvider } from './storage-provider';

/**
 * Prevents unrelated domains from sharing raw storage keys.
 * The wrapped provider remains the single persistence boundary.
 */
export class NamespacedStorageProvider implements StorageProvider {
  constructor(
    private readonly provider: StorageProvider,
    private readonly namespace: string,
  ) {
    const normalized = namespace.trim();
    if (!normalized) throw new Error('Storage namespace must not be empty');
    if (normalized.includes(':')) throw new Error('Storage namespace must not contain ":"');
    this.namespace = normalized;
  }

  private key(key: string): string {
    const normalized = key.trim();
    if (!normalized) throw new Error('Storage key must not be empty');
    return `${this.namespace}:${normalized}`;
  }

  get<T>(key: string): T | null {
    return this.provider.get<T>(this.key(key));
  }

  set<T>(key: string, value: T): void {
    this.provider.set(this.key(key), value);
  }

  remove(key: string): void {
    this.provider.remove(this.key(key));
  }

  clear(): void {
    // A generic StorageProvider cannot enumerate keys safely. Therefore clear()
    // intentionally delegates to the wrapped provider rather than pretending
    // to clear only this namespace.
    this.provider.clear();
  }
}
