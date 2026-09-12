export type UpdateKind = 'config' | 'prompt' | 'policy' | 'web-module';

export interface RemoteUpdateManifest {
  id: string;
  version: string;
  createdAt: string;
  kind: UpdateKind;
  target: string;
  payloadUrl: string;
  sha256: string;
  minRuntimeVersion?: string;
  requiresNativeUpdate: boolean;
}

export interface UpdateState {
  currentVersion: string;
  lastCheckedAt?: string;
  lastAppliedId?: string;
  lastError?: string;
}

export interface RemoteUpdateVerifier {
  verify(manifest: RemoteUpdateManifest, payload: string): boolean | Promise<boolean>;
}

export function isValidUpdateManifest(value: unknown): value is RemoteUpdateManifest {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' && item.id.trim().length > 0 &&
    typeof item.version === 'string' && item.version.trim().length > 0 &&
    typeof item.createdAt === 'string' && !Number.isNaN(Date.parse(item.createdAt)) &&
    (item.kind === 'config' || item.kind === 'prompt' || item.kind === 'policy' || item.kind === 'web-module') &&
    typeof item.target === 'string' && item.target.trim().length > 0 &&
    typeof item.payloadUrl === 'string' && /^https:\/\//.test(item.payloadUrl) &&
    typeof item.sha256 === 'string' && /^[a-fA-F0-9]{64}$/.test(item.sha256) &&
    typeof item.requiresNativeUpdate === 'boolean'
  );
}
