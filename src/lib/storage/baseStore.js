const STORAGE_VERSION = '1.5';
const DEFAULT_NAMESPACE = 'inp2-leadgen';

function createEnvelope(data) {
  return {
    version: STORAGE_VERSION,
    updatedAt: new Date().toISOString(),
    data
  };
}

function getLocalKey(key) {
  return `${DEFAULT_NAMESPACE}:${key}`;
}

export function createStore(key, defaultData) {
  return {
    async load() {
      const remoteRecord = await loadRemote(key);
      if (remoteRecord?.record?.data !== undefined) {
        writeLocal(key, remoteRecord.record);
        return remoteRecord.record.data;
      }

      const localRecord = readLocal(key);
      if (localRecord?.data !== undefined) {
        return localRecord.data;
      }

      return structuredClone(defaultData);
    },

    async save(data) {
      const envelope = createEnvelope(data);
      writeLocal(key, envelope);

      try {
        await saveRemote(key, data);
      } catch {
        // local fallback already written
      }

      return envelope;
    }
  };
}

function readLocal(key) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getLocalKey(key));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocal(key, envelope) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(getLocalKey(key), JSON.stringify(envelope));
  } catch {
    // ignore quota/local errors
  }
}

async function loadRemote(key) {
  if (typeof window === 'undefined' || typeof fetch !== 'function') {
    return null;
  }

  const response = await fetch('/.netlify/functions/state-load', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key,
      namespace: DEFAULT_NAMESPACE
    })
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  return payload?.data || null;
}

async function saveRemote(key, data) {
  if (typeof window === 'undefined' || typeof fetch !== 'function') {
    return null;
  }

  const response = await fetch('/.netlify/functions/state-save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key,
      namespace: DEFAULT_NAMESPACE,
      data
    })
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}
