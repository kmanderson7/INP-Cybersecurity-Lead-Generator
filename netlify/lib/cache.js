const cache = new Map();

export function getCacheKey(domain, endpoint, params = {}) {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');
  return `${domain}:${endpoint}:${sortedParams}`;
}

export function get(key) {
  const cached = cache.get(key);
  if (!cached) return null;

  const { data, timestamp, ttl } = cached;
  if (Date.now() - timestamp > ttl) {
    cache.delete(key);
    return null;
  }

  return data;
}

export function set(key, data, ttlMs = 24 * 60 * 60 * 1000) { // 24h default
  cache.set(key, {
    data,
    timestamp: Date.now(),
    ttl: ttlMs,
  });
}

export function clear(pattern) {
  if (pattern) {
    for (const key of cache.keys()) {
      if (key.includes(pattern)) {
        cache.delete(key);
      }
    }
  } else {
    cache.clear();
  }
}

export function stats() {
  return {
    size: cache.size,
    keys: [...cache.keys()],
  };
}