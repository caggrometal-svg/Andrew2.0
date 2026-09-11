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
  return lat >= -56 && lat <= -17 && lon >= -76 && lon <= -66;
}

function clean(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseEvents(html: string): SeismicEvent[] {
  const rows = html.split(/<tr\b/i).slice(1).map((part) => part.split(/<\/tr>/i)[0]);
  const events: SeismicEvent[] = [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => clean(m[1]));
    if (cells.length < 3) continue;
    const date = cells.find((c) => /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(c))?.match(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/)?.[0];
    const depthText = cells.find((c) => /\d+(?:\.\d+)?\s*km/i.test(c));
    const depth = Number(depthText?.match(/\d+(?:\.\d+)?/)?.[0]);
    const magnitudeText = cells.find((c) => /(?:MLv|ML|Mw|Mww|M)\b/i.test(c)) ?? cells.at(-1) ?? '';
    const magnitude = Number(magnitudeText.match(/\d+(?:\.\d+)?/)?.[0]);
    const coordinates = cells.join(' ').match(/(-?\d+\.\d+)\s+(-?\d+\.\d+)/);
    const lat = coordinates ? Number(coordinates[1]) : null;
    const lon = coordinates ? Number(coordinates[2]) : null;
    if (!date || !Number.isFinite(depth) || !Number.isFinite(magnitude)) continue;
    if (lat !== null && lon !== null && !chileBounds(lat, lon)) continue;
    events.push({
      id: `${date}-${events.length}`,
      localDate: date,
      place: cells.find((c) => /\b(al|de|del|km|O|E|N|S|NO|NE|SO|SE)\b/i.test(c)) ?? cells[1] ?? 'Chile',
      depthKm: depth,
      magnitude,
      lat,
      lon,
      source: CSN_URL,
    });
  }
  return events.slice(0, 50);
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
    note: 'Análisis histórico descriptivo de la muestra. No predice fecha, lugar ni magnitud de futuros terremotos.',
  };
}
