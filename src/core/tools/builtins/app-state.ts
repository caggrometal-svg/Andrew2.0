import { getDashboardModel, type DashboardModel } from '../../../app/dashboard-model';
import type { ToolDefinition, ToolExecutionContext } from '../tool-types';

export interface AppStateArgs {
  readonly includeConnectors?: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isAppStateArgs = (value: unknown): value is AppStateArgs => {
  if (!isRecord(value)) return false;
  return value.includeConnectors === undefined || typeof value.includeConnectors === 'boolean';
};

export const createAppStateTool = (): ToolDefinition<AppStateArgs, DashboardModel> => ({
  name: 'app.state.read',
  risk: 'read',
  description: 'Read-only snapshot of the enabled Andrew/IAC33 application modules and connectors.',
  capabilities: ['state.read'],
  validate: isAppStateArgs,
  execute: async (args: AppStateArgs, context: ToolExecutionContext): Promise<DashboardModel> => {
    if (context.signal.aborted) throw new DOMException('Operation aborted', 'AbortError');
    const snapshot = getDashboardModel();
    if (context.signal.aborted) throw new DOMException('Operation aborted', 'AbortError');
    return args.includeConnectors === false ? { ...snapshot, connectors: [] } : snapshot;
  },
});
