import { fetchWithRetry } from './http.js';

const STORAGE_VERSION = '1.5';
const DEFAULT_NAMESPACE = 'inp2-leadgen';
const DEFAULT_TABLE = process.env.SUPABASE_APP_STATE_TABLE || 'app_state';

export function createVersionedRecord(data, version = STORAGE_VERSION) {
  return {
    version,
    updatedAt: new Date().toISOString(),
    data
  };
}

export async function loadStateRecord(key, namespace = DEFAULT_NAMESPACE) {
  const blobsResult = await loadFromNetlifyBlobs(key, namespace);
  if (blobsResult) {
    return blobsResult;
  }

  const supabaseResult = await loadFromSupabase(key, namespace);
  if (supabaseResult) {
    return supabaseResult;
  }

  return null;
}

export async function saveStateRecord(key, data, namespace = DEFAULT_NAMESPACE) {
  const record = createVersionedRecord(data);

  const blobsResult = await saveToNetlifyBlobs(key, namespace, record);
  if (blobsResult) {
    return blobsResult;
  }

  const supabaseResult = await saveToSupabase(key, namespace, record);
  if (supabaseResult) {
    return supabaseResult;
  }

  return {
    backend: 'client_fallback',
    namespace,
    key,
    record
  };
}

export async function getStorageBackendsStatus() {
  return {
    netlifyBlobs: await detectNetlifyBlobs(),
    supabase: detectSupabase()
  };
}

async function detectNetlifyBlobs() {
  try {
    const mod = await import('@netlify/blobs');
    return Boolean(mod?.getStore);
  } catch {
    return false;
  }
}

function detectSupabase() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function loadFromNetlifyBlobs(key, namespace) {
  try {
    const mod = await import('@netlify/blobs');
    if (!mod?.getStore) {
      return null;
    }

    const store = mod.getStore(namespace);
    const record = await store.get(key, { type: 'json' });
    if (!record) {
      return null;
    }

    return {
      backend: 'netlify_blobs',
      namespace,
      key,
      record
    };
  } catch {
    return null;
  }
}

async function saveToNetlifyBlobs(key, namespace, record) {
  try {
    const mod = await import('@netlify/blobs');
    if (!mod?.getStore) {
      return null;
    }

    const store = mod.getStore(namespace);
    await store.setJSON(key, record);

    return {
      backend: 'netlify_blobs',
      namespace,
      key,
      record
    };
  } catch {
    return null;
  }
}

async function loadFromSupabase(key, namespace) {
  if (!detectSupabase()) {
    return null;
  }

  try {
    const url = `${process.env.SUPABASE_URL}/rest/v1/${DEFAULT_TABLE}?select=namespace,key,version,updated_at,payload&namespace=eq.${encodeURIComponent(namespace)}&key=eq.${encodeURIComponent(key)}&limit=1`;
    const response = await fetchWithRetry(url, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    }, 1, 10000);

    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      backend: 'supabase',
      namespace,
      key,
      record: {
        version: row.version || STORAGE_VERSION,
        updatedAt: row.updated_at || new Date().toISOString(),
        data: row.payload || null
      }
    };
  } catch {
    return null;
  }
}

async function saveToSupabase(key, namespace, record) {
  if (!detectSupabase()) {
    return null;
  }

  try {
    const url = `${process.env.SUPABASE_URL}/rest/v1/${DEFAULT_TABLE}`;
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify([{
        namespace,
        key,
        version: record.version,
        updated_at: record.updatedAt,
        payload: record.data
      }])
    }, 1, 10000);

    if (!response.ok) {
      return null;
    }

    return {
      backend: 'supabase',
      namespace,
      key,
      record
    };
  } catch {
    return null;
  }
}
