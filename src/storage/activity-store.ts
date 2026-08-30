import type { ActivityRecord } from '../core/types';
import { ActivityLog } from '../activity/activity-log';
import type { StorageProvider } from './storage-provider';

const KEY = 'iac33.activity.v1';

export class PersistentActivityStore {
  constructor(private readonly storage: StorageProvider) {}

  load(): ActivityLog {
    const log = new ActivityLog();
    const records = this.storage.get<ActivityRecord[]>(KEY) ?? [];
    records.forEach((record) => log.append(record));
    return log;
  }

  save(log: ActivityLog): void {
    this.storage.set(KEY, log.all());
  }
}
