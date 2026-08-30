import type { ConnectorStatus, Source } from './iac33-types';

export interface Connector extends ConnectorStatus {
  description: string;
  capabilities: string[];
}

export const defaultConnectors: Connector[] = [
  { id: 'internet-open', name: 'Internet abierta', category: 'internet', enabled: true, authorized: true, description: 'Fuentes web públicas accesibles mediante conectores.', capabilities: ['búsqueda', 'consulta de fuentes'] },
  { id: 'deep-web', name: 'Deep web legítimamente accesible', category: 'deep-web', enabled: false, authorized: false, description: 'Recursos no indexados que requieran acceso legítimo.', capabilities: ['investigación'] },
  { id: 'satellite-data', name: 'Datos satelitales', category: 'satellite', enabled: false, authorized: false, description: 'Servicios de observación terrestre y datos satelitales con API autorizada.', capabilities: ['observación', 'geoespacial'] },
  { id: 'seismic', name: 'Datos sísmicos', category: 'seismic', enabled: true, authorized: true, description: 'Conector preparado para fuentes sísmicas verificables.', capabilities: ['eventos', 'magnitud', 'localización'] },
  { id: 'weather', name: 'Datos meteorológicos', category: 'weather', enabled: true, authorized: true, description: 'Conector preparado para observaciones y pronósticos meteorológicos.', capabilities: ['lluvia', 'temperatura', 'alertas'] },
];

export function sourceQuality(source: Source): number {
  return ({ 'very-high': 1, high: 0.8, medium: 0.6, low: 0.35, 'very-low': 0.15 } as const)[source.reliability];
}
