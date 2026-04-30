export function normalizeApiPayload(payload) {
  if (!payload) {
    return payload;
  }

  if (!payload.data || !payload.meta) {
    return payload;
  }

  const normalized = {
    ...payload.data,
    success: payload.success ?? true,
    meta: payload.meta,
    source: payload.meta.source,
    provider: payload.meta.provider
  };

  if (Array.isArray(normalized.leads)) {
    normalized.leads = normalized.leads.map((lead) => decorateLeadWithMeta(lead, payload.meta));
  }

  if (Array.isArray(normalized.signals)) {
    normalized.signals = normalized.signals.map((signal) => decorateSignalWithMeta(signal, payload.meta));
  }

  return normalized;
}

export function decorateLeadWithMeta(lead = {}, meta = {}) {
  const leadSignals = Array.isArray(lead.signals)
    ? lead.signals.map((signal) => decorateSignalWithMeta(signal, meta))
    : [];
  const contacts = Array.isArray(lead.contacts || lead.executives)
    ? (lead.contacts || lead.executives).map((contact) => ({
        ...contact,
        sourceMeta: contact.sourceMeta || lead.sourceMeta || meta
      }))
    : [];

  return {
    ...lead,
    signals: leadSignals,
    contacts,
    executives: contacts,
    sourceMeta: lead.sourceMeta || meta
  };
}

export function decorateSignalWithMeta(signal = {}, meta = {}) {
  return {
    ...signal,
    meta: signal.meta || meta
  };
}

export function getSourceBadge(meta = {}) {
  const source = meta.source || 'mock';

  const labels = {
    mock: 'Mock',
    apollo_live: 'Apollo Live',
    apollo_fallback: 'Apollo Fallback',
    provider_live: 'Provider Live',
    provider_fallback: 'Provider Fallback',
    ai_synthesized: 'AI Synthesized',
    simulated: 'Simulated'
  };

  const classNames = {
    mock: 'bg-slate-100 text-slate-700 border-slate-300',
    apollo_live: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    apollo_fallback: 'bg-amber-100 text-amber-800 border-amber-300',
    provider_live: 'bg-sky-100 text-sky-800 border-sky-300',
    provider_fallback: 'bg-amber-100 text-amber-800 border-amber-300',
    ai_synthesized: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    simulated: 'bg-slate-100 text-slate-700 border-slate-300'
  };

  return {
    label: labels[source] || source,
    className: classNames[source] || classNames.mock
  };
}

export function getSourceWarning(meta = {}) {
  if (!meta || meta.live) {
    return null;
  }

  if (meta.source === 'simulated') {
    return 'This action was simulated because no live provider is configured.';
  }

  if (meta.source === 'ai_synthesized') {
    return 'This result includes AI-synthesized intelligence and should be reviewed before acting on it.';
  }

  return meta.reason || 'This result is using fallback or mock intelligence.';
}

export function isNonLiveMeta(meta = {}) {
  return Boolean(meta) && meta.live === false;
}
