export type SeismicEvent = {
  id: string;
  localDate: string;
  place: string;
  depthKm: number;
  magnitude: number;
  lat: number | null;
  lon: number | null;
  source: string;
};

const CSN_URL = 'https://www.sismologia.cl/';

function chileBounds(lat: number, lon: number): boolean {
  if (lat < -56 || lat > -17 || lon < -76 || lon > -66) return false;
  // Conservative Chile mainland/insular corridor. This intentionally excludes
  // the obvious Argentina/Bolivia/Peru events that appear on the CSN feed.
  const west = -75.8 + (lat + 56) * 0.005;
  const east = lat > -25 ? -68.0 : -69.0;
  return lon >= west && lon <= east;
}

function parseEvents(html: string): SeismicEvent[] {
  const rows = [...html.matchAll(/<tr[\\s\\S]*?<\\/tr>/gi)].map((m) => m[0]);
  const events: SeismicEvent[] = [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\\s\\S]*?)<\\/td>/gi)].map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim());
    if (cells.length < 3) continue;
    const date = cells[0].match(/\\d{4}-\\d{2}-\\d{2}\\s+\\d{2}:\\d{2}:\\d{2}/)?.[0];
    const depth = Number(cells.find((c) => /\\d+\\s*km/i.test(c))?.match(/\\d+(?:\\.\\d+)?/)?.[0]);
    const magnitude = Number(cells.at(-1)?.match(/\\d+(?:\\.\\d+)?/)?.[0]);
    const coords = cells.join(' ').match(/(-?\\d+\\.\\d+)\\s+(-?\\d+\\.\\d+)/);
    const lat = coords ? Number(coords[1]) : null;
    const lon = coords ? Number(coords[2]) : null;
    if (!date || !Number.isFinite(depth) || !Number.isFinite(magnitude)) continue;
    if (lat !== null && lon !== null && !chileBounds(lat, lon)) continue;
    events.push({ id: `${date}-${cells[1]}`, localDate: date, place: cells[1] || 'Chile', depthKm: depth, magnitude, lat, lon, source: CSN_URL });
  }
  return events.slice(0, 30);
}

export async function fetchChileSeismicity(signal?: AbortSignal): Promise<SeismicEvent[]> {
  const response = await fetch(CSN_URL, { signal, headers: { Accept: 'text/html' } });
  if (!response.ok) throw new Error(`CSN respondió HTTP ${response.status}`);
  return parseEvents(await response.text());
}

export function seismicProjection(events: SeismicEvent[]) {
  if (!events.length) return { count: 0, maxMagnitude: 0, avgDepth: 0, note: 'Sin muestra suficiente.' };
  const maxMagnitude = Math.max(...events.map((e) => e.magnitude));
  const avgDepth = events.reduce((sum, e) => sum + e.depthKm, 0) / events.length;
  return {
    count: events.length,
    maxMagnitude,
    avgDepth: Math.round(avgDepth * 10) / 10,
    note: 'Análisis descriptivo de la muestra. No predice fecha, lugar ni magnitud de futuros terremotos.'
  };
}
