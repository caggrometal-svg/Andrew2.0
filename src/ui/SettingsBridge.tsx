import { useEffect, useState } from 'react';
import { IAC33_CONFIG } from '@app/iac33-config';

type SettingsKey = keyof typeof IAC33_CONFIG.modules;
type LocalSettings = Record<SettingsKey, boolean> & { autonomy: 'restricted' | 'assisted' | 'advanced' };

const STORAGE_KEY = 'andrew2-settings-v1';

const defaultSettings: LocalSettings = {
  ...IAC33_CONFIG.modules,
  autonomy: 'assisted',
};

function loadSettings(): LocalSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return defaultSettings;
  }
}

function isSettingsBridgeRequest() {
  const params = new URLSearchParams(window.location.search);
  return params.get('open') === 'settings' || params.get('screen') === 'settings';
}

export function settingsBridgeUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set('open', 'settings');
  url.hash = 'configuracion';
  return url.toString();
}

export default function SettingsBridge({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<LocalSettings>(loadSettings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setSaved(true);
    const timer = window.setTimeout(() => setSaved(false), 1200);
    return () => window.clearTimeout(timer);
  }, [settings]);

  const modules = Object.keys(IAC33_CONFIG.modules) as SettingsKey[];

  return (
    <section id="configuracion" aria-label="Configuración de Andrew" style={{ marginTop: 20, padding: 20, border: '1px solid #2b3440', borderRadius: 14, background: '#111820' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Configuración de Andrew</h2>
          <p style={{ margin: '6px 0 0', color: '#aeb9c5' }}>Centro de control local. Los cambios quedan guardados en este dispositivo.</p>
        </div>
        <button onClick={onClose}>Cerrar</button>
      </div>

      <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
        <label>
          Nivel de autonomía{' '}
          <select value={settings.autonomy} onChange={e => setSettings(s => ({ ...s, autonomy: e.target.value as LocalSettings['autonomy'] }))}>
            <option value="restricted">Restringido</option>
            <option value="assisted">Asistido</option>
            <option value="advanced">Avanzado</option>
          </select>
        </label>

        <strong>Módulos IAC33</strong>
        {modules.map(key => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" checked={settings[key]} onChange={e => setSettings(s => ({ ...s, [key]: e.target.checked }))} />
            {key}
          </label>
        ))}
      </div>

      <p style={{ minHeight: 20, color: '#8fd18f' }}>{saved ? 'Configuración guardada localmente.' : ''}</p>
      <small style={{ color: '#8e9aa7' }}>Puente de acceso: <code>?open=settings</code>. La integración Android de enlace profundo se incorporará en la siguiente etapa.</small>
    </section>
  );
}

export { isSettingsBridgeRequest };
