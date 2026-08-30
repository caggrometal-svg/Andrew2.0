export interface IAC33ModuleConfig {
  seismicChile: boolean;
  rainfallChile: boolean;
  globalConflict: boolean;
  criticalResearch: boolean;
  memory: boolean;
  activityAudit: boolean;
}

export interface IAC33Config {
  modules: IAC33ModuleConfig;
  autonomy: 'restricted' | 'assisted' | 'autonomous';
}

/**
 * Runtime-safe defaults for the IAC33 application.
 * Capabilities remain explicit; enabling a module does not grant external permissions.
 */
export const IAC33_CONFIG: IAC33Config = {
  autonomy: 'restricted',
  modules: {
    seismicChile: true,
    rainfallChile: true,
    globalConflict: true,
    criticalResearch: true,
    memory: true,
    activityAudit: true,
  },
};
