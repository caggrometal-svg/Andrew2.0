export const IAC33_CONFIG = {
  name: 'IAC33',
  version: '0.2.0',
  modules: {
    seismicChile: true,
    rainfallChile: true,
    globalConflict: true,
    criticalResearch: true,
    memory: true,
    activityAudit: true,
  },
  principles: {
    probabilisticForecasting: true,
    sourceTraceability: true,
    contradictionSearch: true,
    uncertaintyRequired: true,
  },
} as const;

export type IAC33Module = keyof typeof IAC33_CONFIG.modules;
