import type { ActivityRecord } from '../core/types';

export class ActivityLog {
  private readonly records: ActivityRecord[] = [];

  append(record: ActivityRecord): void {
    this.records.push({ ...record });
  }

  all(): ActivityRecord[] {
    return this.records.map((record) => {
      const copy: ActivityRecord = { ...record };
      if (record.details !== undefined) copy.details = { ...record.details };
      return copy;
    });
  }

  forProject(projectId: string): ActivityRecord[] {
    return this.records
      .filter((record) => record.details?.['projectId'] === projectId)
      .map((record) => ({ ...record }));
  }

  clear(): void {
    this.records.length = 0;
  }
}
