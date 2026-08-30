export type SatelliteOperation = 'observe'|'downlink'|'task'|'attitude'|'orbit';

export interface SatelliteConnector { id:string; provider:string; authorized:boolean; operations:SatelliteOperation[]; endpoint?:string; }

/**
 * IAC33 satellite-control capability model.
 * Direct command execution is only permitted when an explicitly authorized
 * connector is configured by the operator. Public satellite data remains
 * read-only by default. No credentials or unauthorized endpoints are stored here.
 */
export const satelliteControlPolicy = {
  enabled: true,
  defaultMode: 'read-only' as const,
  requiresExplicitAuthorization: true,
  allowedOperations: ['observe','downlink','task','attitude','orbit'] as SatelliteOperation[],
  auditAllCommands: true,
  denyWithoutAuthorizedConnector: true,
};

export function canExecuteSatelliteOperation(connector:SatelliteConnector|undefined, operation:SatelliteOperation){
  return !!connector?.authorized && connector.operations.includes(operation) && satelliteControlPolicy.enabled;
}
