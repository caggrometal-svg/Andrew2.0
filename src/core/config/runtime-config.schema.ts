export const RUNTIME_CONFIG_VERSION = 1 as const;

export interface RuntimeConfig {
  readonly version: typeof RUNTIME_CONFIG_VERSION;
  readonly revision: number;
  readonly syncEnabled: boolean;
  readonly timeoutMs: number;
  readonly pollIntervalMs: number;
  readonly model?: string;
}

export type RuntimeConfigInput = Omit<RuntimeConfig, 'version' | 'revision'> & {
  readonly version?: typeof RUNTIME_CONFIG_VERSION;
  readonly revision?: number;
};

const LIMITS = Object.freeze({ timeoutMs: 300_000, pollIntervalMs: 86_400_000, modelLength: 256 });

function assertFiniteInteger(name: string, value: unknown, max: number): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > max) throw new TypeError(`invalid ${name}`);
}

function assertBoolean(name: string, value: unknown): asserts value is boolean {
  if (typeof value !== 'boolean') throw new TypeError(`invalid ${name}`);
}

function normalizeModel(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new TypeError('invalid model');
  const model = value.trim();
  if (!model || model.length > LIMITS.modelLength) throw new TypeError('invalid model');
  return model;
}

export function validateRuntimeConfig(input: RuntimeConfigInput): RuntimeConfig {
  if (input.version !== undefined && input.version !== RUNTIME_CONFIG_VERSION) throw new TypeError('unsupported runtime config version');
  const revision = input.revision ?? 0;
  assertFiniteInteger('revision', revision, Number.MAX_SAFE_INTEGER);
  assertBoolean('syncEnabled', input.syncEnabled);
  assertFiniteInteger('timeoutMs', input.timeoutMs, LIMITS.timeoutMs);
  assertFiniteInteger('pollIntervalMs', input.pollIntervalMs, LIMITS.pollIntervalMs);
  const model = normalizeModel(input.model);
  const base: RuntimeConfig = Object.freeze({ version: RUNTIME_CONFIG_VERSION, revision, syncEnabled: input.syncEnabled, timeoutMs: input.timeoutMs, pollIntervalMs: input.pollIntervalMs });
  return Object.freeze(model === undefined ? base : { ...base, model });
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = Object.freeze({
  version: RUNTIME_CONFIG_VERSION,
  revision: 0,
  syncEnabled: true,
  timeoutMs: 30_000,
  pollIntervalMs: 900_000,
});
