import type { AndroidBridgeCommand, AndroidBridgeCommandEnvelope, AndroidBridgeAck } from './androidBridgeV3';

export type BridgeExecutorResult = { ok: true } | { ok: false; error: 'expired' | 'unsupported' | 'invalid_payload' };
export type BridgeExecutor = (command: AndroidBridgeCommandEnvelope) => Promise<BridgeExecutorResult> | BridgeExecutorResult;

export type BridgeInboxClientOptions = {
  baseUrl: string;
  userId: string;
  pollIntervalMs?: number;
  fetchImpl?: typeof fetch;
};

const DEFAULT_POLL_MS = 5000;
const COMMANDS = new Set<AndroidBridgeCommand>(['open_settings', 'set_runtime_parameter', 'request_status', 'sync_now']);

function validEnvelope(value: unknown): value is AndroidBridgeCommandEnvelope {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && item.id.length <= 64
    && typeof item.command === 'string' && COMMANDS.has(item.command as AndroidBridgeCommand)
    && typeof item.createdAt === 'number' && typeof item.expiresAt === 'number'
    && item.expiresAt > item.createdAt;
}

export class AndroidBridgeV3InboxClient {
  private readonly baseUrl: string;
  private readonly userId: string;
  private readonly pollIntervalMs: number;
  private readonly fetchImpl: typeof fetch;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;

  constructor(options: BridgeInboxClientOptions) {
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(options.userId)) throw new Error('invalid_user_id');
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.userId = options.userId;
    this.pollIntervalMs = Math.max(1000, options.pollIntervalMs ?? DEFAULT_POLL_MS);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async poll(executor: BridgeExecutor): Promise<AndroidBridgeAck[]> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/v1/bridge/v3/commands`, {
      headers: { 'X-Andrew-User-Id': this.userId },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json() as { ok?: boolean; commands?: unknown[] };
    if (body.ok !== true || !Array.isArray(body.commands)) throw new Error('invalid_inbox_response');
    const acks: AndroidBridgeAck[] = [];
    for (const candidate of body.commands) {
      if (!validEnvelope(candidate)) continue;
      const result = candidate.expiresAt <= Date.now() ? { ok: false, error: 'expired' as const } : await executor(candidate);
      const ackResponse = await this.fetchImpl(`${this.baseUrl}/api/v1/bridge/v3/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Andrew-User-Id': this.userId },
        body: JSON.stringify({ id: candidate.id, ok: result.ok, ...(result.ok ? {} : { error: result.error }) }),
      });
      if (!ackResponse.ok) throw new Error(`HTTP ${ackResponse.status}`);
      const ack = await ackResponse.json() as AndroidBridgeAck & { id?: string; acknowledgedAt?: number };
      acks.push({ id: ack.id ?? candidate.id, ok: result.ok, ...(result.ok ? {} : { error: result.error }), acknowledgedAt: ack.acknowledgedAt ?? Date.now() });
    }
    return acks;
  }

  start(executor: BridgeExecutor): void {
    if (this.running) return;
    this.running = true;
    const tick = async () => {
      if (!this.running) return;
      try { await this.poll(executor); } finally {
        if (this.running) this.timer = setTimeout(tick, this.pollIntervalMs);
      }
    };
    void tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  isRunning(): boolean { return this.running; }
}
