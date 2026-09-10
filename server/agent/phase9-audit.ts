import type { Phase9AuditEvent, Phase9AuditSink } from './phase9-types';

export class InMemoryPhase9AuditSink implements Phase9AuditSink {
  readonly events: Phase9AuditEvent[] = [];
  async append(event: Phase9AuditEvent): Promise<void> { this.events.push(Object.freeze({ ...event })); }
}
