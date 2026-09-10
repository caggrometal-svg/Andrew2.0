import { closeAgentStateStore, listResumableAgentRuns, loadAgentState, saveAgentState } from './agent-state-store.mjs';

export const postgresAgentStateStore = Object.freeze({
  save: saveAgentState,
  load: loadAgentState,
  listResumable: listResumableAgentRuns,
  close: closeAgentStateStore,
});
