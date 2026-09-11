export const SEISMIC_SOURCE = {
  name: 'Centro Sismológico Nacional',
  shortName: 'CSN',
  institution: 'Universidad de Chile',
  officialUrl: 'https://www.sismologia.cl/',
  scope: 'Chile',
  endpoint: import.meta.env.VITE_SEISMIC_ENDPOINT ?? '/api/seismic/chile',
  historicalEndpoint: import.meta.env.VITE_SEISMIC_HISTORY_ENDPOINT ?? '/api/seismic/chile/history',
} as const;

/** Conservative geographic envelope used to reject non-Chile events client-side. */
export const CHILE_BOUNDS = {
  minLatitude: -56,
  maxLatitude: -17,
  minLongitude: -76,
  maxLongitude: -66,
} as const;

export interface SeismicEvent {
  id: string;
  occurredAt: string;
  latitude: number;
  longitude: number;
  depthKm: number;
  magnitude: number;
  magnitudeType?: string;
  place: string;
  felt?: boolean;
}

export function isInsideChile(event: Pick<SeismicEvent, 'latitude' | 'longitude'>): boolean {
  return event.latitude >= CHILE_BOUNDS.minLatitude
    && event.latitude <= CHILE_BOUNDS.maxLatitude
    && event.longitude >= CHILE_BOUNDS.minLongitude
    && event.longitude <= CHILE_BOUNDS.maxLongitude;
}

export function filterChileEvents(events: SeismicEvent[]): SeismicEvent[] {
  return events.filter(isInsideChile);
}

export function historicalSummary(events: SeismicEvent[]) {
  const scoped = filterChileEvents(events);
  if (!scoped.length) return { count: 0, meanMagnitude: 0, medianMagnitude: 0, maxMagnitude: 0 };
  const magnitudes = scoped.map((event) => event.magnitude).sort((a, b) => a - b);
  const middle = Math.floor(magnitudes.length / 2);
  const medianMagnitude = magnitudes.length % 2 === 0
    ? (magnitudes[middle - 1] + magnitudes[middle]) / 2
    : magnitudes[middle];
  return {
    count: scoped.length,
    meanMagnitude: magnitudes.reduce((sum, value) => sum + value, 0) / magnitudes.length,
    medianMagnitude,
    maxMagnitude: magnitudes[magnitudes.length - 1],
  };
}
