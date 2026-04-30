import { randomUUID } from 'crypto';

const LIVE_SOURCES = new Set(['apollo_live', 'provider_live']);
const FALLBACK_SOURCES = new Set(['apollo_fallback', 'provider_fallback', 'mock', 'simulated']);

export function parseBooleanEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

export function requireLiveDataEnabled() {
  return parseBooleanEnv(process.env.REQUIRE_LIVE_DATA, false);
}

export function isLiveSource(source) {
  return LIVE_SOURCES.has(source);
}

export function isFallbackSource(source) {
  return FALLBACK_SOURCES.has(source);
}

export function buildMeta({
  source = 'mock',
  provider = 'unknown',
  reason,
  correlationId = randomUUID(),
  fetchedAt = new Date().toISOString(),
  live = isLiveSource(source),
  fallbackUsed = isFallbackSource(source),
  confidence
} = {}) {
  const meta = {
    source,
    provider,
    live,
    fallbackUsed,
    fetchedAt,
    correlationId
  };

  if (reason) {
    meta.reason = reason;
  }

  if (typeof confidence === 'number') {
    meta.confidence = confidence;
  }

  return meta;
}

export function wrapSuccess(data, metaOptions = {}) {
  return {
    success: true,
    data,
    meta: buildMeta(metaOptions)
  };
}

export function wrapError(message, metaOptions = {}) {
  return {
    success: false,
    error: message,
    meta: buildMeta(metaOptions)
  };
}

export function attachSignalMeta(signals = [], metaOptions = {}) {
  const baseMeta = buildMeta(metaOptions);

  return signals.map((signal) => ({
    ...signal,
    confidence: normalizeConfidence(signal.confidence, baseMeta.confidence),
    meta: {
      ...baseMeta,
      ...(signal.meta || {})
    }
  }));
}

export function normalizeConfidence(value, fallback = 0.5) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'high') return 0.85;
    if (normalized === 'medium') return 0.65;
    if (normalized === 'low') return 0.45;
  }

  return fallback;
}

export function getApolloProviderConfig() {
  const laminarKey = process.env.APOLLO_LAMINAR_API_KEY;
  const legacyKey = process.env.APOLLO_API_KEY;

  if (laminarKey) {
    return {
      apiKey: laminarKey,
      provider: 'apollo_laminar',
      source: 'apollo_live',
      mode: 'laminar'
    };
  }

  if (legacyKey) {
    return {
      apiKey: legacyKey,
      provider: 'apollo_legacy',
      source: 'apollo_fallback',
      mode: 'legacy'
    };
  }

  return {
    apiKey: null,
    provider: 'mock',
    source: 'mock',
    mode: 'mock'
  };
}

export function logProviderEvent({
  functionName,
  provider,
  correlationId,
  startedAt,
  status,
  reason
}) {
  const durationMs = Date.now() - startedAt;
  const parts = [
    `[${functionName}]`,
    `provider=${provider}`,
    `status=${status}`,
    `durationMs=${durationMs}`,
    `correlationId=${correlationId}`
  ];

  if (reason) {
    parts.push(`reason=${reason}`);
  }

  console.log(parts.join(' '));
}
