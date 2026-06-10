import { useState, useEffect, useCallback } from 'react';

// Configurable backend API base URL — matches aixiaoshuojia.cn endpoints
const API_BASE =
  localStorage.getItem('api_base') || 'http://localhost:3001/api/proxy';

const getAuthHeaders = () => {
  const t = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` };
};

// ── Panel → API module path mapping ──────────────────────────────────
const MODULE_PATHS: Record<string, string> = {
  worldview: 'worldviews',
  storycore: 'story-cores',
  items: 'items',
  currency: 'currencies',
  factions: 'factions',
  powersystems: 'power-systems',
  skillsystems: 'skill-systems',
  specialsettings: 'special-settings',
  characters: 'characters',
  characterrelations: 'character-relations',
  geomap: 'geo-maps',
  foreshadowing: 'foreshadows',
  plotstructure: 'plot-structures',
  eventlines: 'event-lines',
  outlines: 'outlines',
  sidestories: 'side-stories',
  timeline: 'timeline',
};

export type ModuleName = keyof typeof MODULE_PATHS;

// ── Which modules support which endpoints on the real API ────────────
// Only worldviews supports /versions. Silence 404s for others.
const VERSIONS_SUPPORTED = new Set<string>(['worldviews']);
const GENERATIONS_SUPPORTED = new Set<string>([
  'worldviews',
  'factions',
  'geo-maps',
  'foreshadows',
  'power-systems',
  'special-settings',
  'outlines',
  'items',
  'currencies',
]);
const PUT_PROJECT_SUPPORTED = new Set<string>([
  'worldviews',
  'story-cores',
  'items',
  'currencies',
  'characters',
  'outlines',
  'character-relations',
]);

// ── Generation history ─────────────────────────────────────────────
export async function saveGeneration(
  module: ModuleName,
  projectId: number,
  params: {
    提示词: string;
    生成类型: string;
    生成内容: Record<string, any>;
    [key: string]: any;
  }
) {
  const base = MODULE_PATHS[module];
  if (!GENERATIONS_SUPPORTED.has(base))
    return { success: false, skipped: true };
  try {
    const res = await fetch(
      `${API_BASE}/api/${base}/project/${projectId}/generations`,
      {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(params),
      }
    );
    return await res.json();
  } catch {
    return { success: false };
  }
}

// ── Version snapshot ────────────────────────────────────────────────
export async function saveVersion(
  module: ModuleName,
  projectId: number,
  params: { 描述: string; 内容: Record<string, any> }
) {
  const base = MODULE_PATHS[module];
  if (!VERSIONS_SUPPORTED.has(base)) return { success: false, skipped: true };
  try {
    const res = await fetch(
      `${API_BASE}/api/${base}/project/${projectId}/versions`,
      {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(params),
      }
    );
    return await res.json();
  } catch {
    return { success: false };
  }
}

// ── Persist data to server (PUT) ───────────────────────────────────
export async function saveData(
  module: ModuleName,
  projectId: number,
  data: Record<string, any>
) {
  const base = MODULE_PATHS[module];
  if (!PUT_PROJECT_SUPPORTED.has(base))
    return { success: false, skipped: true };
  try {
    const res = await fetch(`${API_BASE}/api/${base}/project/${projectId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return await res.json();
  } catch {
    return { success: false };
  }
}

// ── Adopt a generation ────────────────────────────────────────────
export async function adoptGeneration(
  module: ModuleName,
  projectId: number,
  generationId: string
) {
  const base = MODULE_PATHS[module];
  if (!GENERATIONS_SUPPORTED.has(base))
    return { success: false, skipped: true };
  try {
    const res = await fetch(
      `${API_BASE}/api/${base}/project/${projectId}/generations/${generationId}/adopt`,
      { method: 'PUT', headers: getAuthHeaders() }
    );
    return await res.json();
  } catch {
    return { success: false };
  }
}

export function useWorldApi<T = any>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    if (!url) return;
    setLoading(true);
    fetch(url, { headers: getAuthHeaders() })
      .then(res => {
        if (!res.ok) return null;
        return res.json();
      })
      .then(result => {
        if (result && result.success && result.data != null)
          setData(result.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [url]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, reload: load, setData };
}

export function useWorldApiMulti<T = any>(urls: Record<string, string>) {
  const [data, setData] = useState<Record<string, T>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const entries = Object.entries(urls);
    Promise.all(
      entries.map(([key, url]) =>
        fetch(url, { headers: getAuthHeaders() })
          .then(res => res.json())
          .then(result => [key, result.success ? result.data : null])
          .catch(() => [key, null])
      )
    )
      .then(results => {
        const obj: Record<string, T> = {};
        results.forEach(([k, v]) => {
          obj[k as string] = v as T;
        });
        setData(obj);
      })
      .finally(() => setLoading(false));
  }, [JSON.stringify(urls)]);

  return { data, loading };
}

export { API_BASE, getAuthHeaders };
