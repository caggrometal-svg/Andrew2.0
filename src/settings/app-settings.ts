export type AppSettings = {
  notifications: boolean;
  autoScroll: boolean;
  seismicAutoRefresh: boolean;
  reducedMotion: boolean;
};

const KEY = 'andrew:settings:v1';
export const DEFAULT_SETTINGS: AppSettings = {
  notifications: true,
  autoScroll: true,
  seismicAutoRefresh: true,
  reducedMotion: false,
};

function storage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

export function loadSettings(): AppSettings {
  try {
    const raw = storage()?.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

export function saveSettings(settings: AppSettings): AppSettings {
  storage()?.setItem(KEY, JSON.stringify(settings));
  return settings;
}
