import type { ActivityRecord } from '../core/types';

export class ActivityLog {
  private readonly records: ActivityRecord[] = [];

  append(record: ActivityRecord): void {
    this.records.push({ ...record });
  }

  all(): ActivityRecord[] {
    return this.records.map((record) => ({ ...record, details: record.details ? { ...record.details } : undefined }));
  }

  forProject(projectId: string): ActivityRecord[] {
    return this.records.filter((record) => record.details?.projectId === projectId).map((record) => ({ ...record }));
  }

  clear(): void {
    this.records.length = 0;
  }
}
