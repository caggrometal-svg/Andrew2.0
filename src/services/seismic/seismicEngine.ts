export interface SeismicEvent {
  id: string;
  magnitude: number;
  place: string;
  time: number;
  coordinates: [number, number, number];
}

export interface SeismicLocalEvent extends SeismicEvent {
  localTime: string;
}

export interface SeismicForecastResult {
  totalEventsAnalyzed: number;
  windowDays: number;
  probabilityNext14Days: number;
  probabilityNext30Days: number;
  highestRiskMagnitudeExpected: number;
  activeAnomaliesDetected: boolean;
  lastUpdated: string;
  dataSource: string;
  chileEventsAnalyzed: number;
  chileLatestEvents: SeismicLocalEvent[];
}

interface USGSFeature {
  id: string;
  properties: { mag: number | null; place: string | null; time: number | null };
  geometry: { coordinates: number[] };
}

interface USGSFeed {
  features?: USGSFeature[];
}

export class SeismicPredictionEngine {
  private readonly USGS_ENDPOINT = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson';
  private readonly WINDOW_DAYS = 30;
  private readonly CHILE_BOUNDS = { minLat: -56, maxLat: -17, minLon: -76, maxLon: -66 };

  async fetchAndComputeForecast(minMagnitudeFilter = 4.0): Promise<SeismicForecastResult> {
    const response = await fetch(this.USGS_ENDPOINT, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`USGS respondió HTTP ${response.status}`);

    const data = await response.json() as USGSFeed;
    const now = Date.now();
    const windowStart = now - this.WINDOW_DAYS * 24 * 60 * 60 * 1000;

    const events: SeismicEvent[] = (data.features ?? [])
      .map((feature): SeismicEvent | null => {
        const magnitude = feature.properties.mag;
        const time = feature.properties.time;
        const coordinates = feature.geometry.coordinates;
        if (!feature.id || magnitude === null || magnitude === undefined || time === null || time === undefined) return null;
        if (!Number.isFinite(magnitude) || !Number.isFinite(time) || time < windowStart || time > now) return null;
        if (coordinates.length < 3 || !coordinates.every(Number.isFinite)) return null;
        const longitude = coordinates[0];
        const latitude = coordinates[1];
        const depth = coordinates[2];
        if (longitude === undefined || latitude === undefined || depth === undefined) return null;
        return {
          id: feature.id,
          magnitude,
          place: feature.properties.place ?? 'Ubicación no informada',
          time,
          coordinates: [longitude, latitude, depth],
        };
      })
      .filter((event): event is SeismicEvent => event !== null && event.magnitude >= minMagnitudeFilter);

    const chileEvents = events.filter(event => this.isInChile(event.coordinates[1], event.coordinates[0]));
    const totalEvents = events.length;
    const probabilityNext14Days = this.poissonAtLeastOneProbability(totalEvents / this.WINDOW_DAYS, 14);
    const probabilityNext30Days = this.poissonAtLeastOneProbability(totalEvents / this.WINDOW_DAYS, 30);
    const highestRiskMagnitudeExpected = this.estimateMedianMaximumMagnitude(events, minMagnitudeFilter);

    return {
      totalEventsAnalyzed: totalEvents,
      windowDays: this.WINDOW_DAYS,
      probabilityNext14Days,
      probabilityNext30Days,
      highestRiskMagnitudeExpected,
      activeAnomaliesDetected: this.detectRateAnomaly(events, now),
      lastUpdated: new Date().toISOString(),
      dataSource: 'USGS Earthquake Hazards Program · all_month.geojson',
      chileEventsAnalyzed: chileEvents.length,
      chileLatestEvents: chileEvents
        .sort((a, b) => b.time - a.time)
        .slice(0, 12)
        .map(event => ({ ...event, localTime: this.formatChileTime(event.time) })),
    };
  }

  private isInChile(latitude: number, longitude: number): boolean {
    return latitude >= this.CHILE_BOUNDS.minLat && latitude <= this.CHILE_BOUNDS.maxLat && longitude >= this.CHILE_BOUNDS.minLon && longitude <= this.CHILE_BOUNDS.maxLon;
  }

  private formatChileTime(timestamp: number): string {
    return new Intl.DateTimeFormat('es-CL', {
      timeZone: 'America/Santiago',
      dateStyle: 'short',
      timeStyle: 'medium',
      hour12: false,
    }).format(new Date(timestamp));
  }

  private poissonAtLeastOneProbability(ratePerDay: number, horizonDays: number): number {
    if (ratePerDay <= 0) return 0;
    return Number((100 * (1 - Math.exp(-ratePerDay * horizonDays))).toFixed(1));
  }

  private estimateMedianMaximumMagnitude(events: SeismicEvent[], minMagnitude: number): number {
    if (events.length === 0) return minMagnitude;
    const meanMagnitude = events.reduce((sum, event) => sum + event.magnitude, 0) / events.length;
    const bValue = Math.log10(Math.E) / Math.max(meanMagnitude - minMagnitude, 0.05);
    const thirtyDayRateAtMin = events.length / this.WINDOW_DAYS;
    const targetRate = Math.log(2) / 30;
    const magnitude = minMagnitude + Math.log10(Math.max(thirtyDayRateAtMin / targetRate, 1)) / Math.max(bValue, 0.05);
    return Number(Math.max(minMagnitude, magnitude).toFixed(1));
  }

  private detectRateAnomaly(events: SeismicEvent[], now: number): boolean {
    if (events.length < 10) return false;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const recent = events.filter((event) => event.time >= now - sevenDays).length;
    const prior = events.length - recent;
    if (prior <= 0) return false;
    const recentDailyRate = recent / 7;
    const priorDailyRate = prior / 23;
    return recentDailyRate >= priorDailyRate * 2 && recent - (prior * 7 / 23) >= 3;
  }
}

export const seismicPredictionEngine = new SeismicPredictionEngine();
