export interface WebSource { name: string; url: string; kind: 'earthquake' | 'satellite' | 'science' | 'news'; }

export const PUBLIC_SOURCES: WebSource[] = [
  { name: 'USGS terremotos', url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson', kind: 'earthquake' },
  { name: 'NASA APIs', url: 'https://api.nasa.gov/', kind: 'science' },
  { name: 'NASA Earthdata', url: 'https://earthdata.nasa.gov/', kind: 'satellite' },
];

export async function fetchJson<T>(url: string, timeoutMs = 10000): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json() as T;
  } finally { window.clearTimeout(timeout); }
}

export async function getRecentEarthquakes() {
  const source = PUBLIC_SOURCES[0];
  if (!source) throw new Error('No hay una fuente sísmica configurada.');
  return fetchJson<{ features: Array<{ id: string; properties: { mag: number; place: string; time: number }; geometry: { coordinates: number[] } }> }>(source.url);
}

export const SATELLITE_DATA_POLICY = 'Public satellite data only; no spacecraft command or restricted-network access.';
