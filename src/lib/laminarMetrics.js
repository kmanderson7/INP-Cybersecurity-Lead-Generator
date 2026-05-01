import { LAMINAR_SEGMENTS, LAMINAR_SEGMENT_ORDER, inferContactSegment } from '../../netlify/lib/laminarPilot.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function getSegmentForContact(contact) {
  if (!contact) return null;
  if (contact.segment) return contact.segment;
  if (contact.sourceMeta?.segment) return contact.sourceMeta.segment;
  return inferContactSegment(contact);
}

export function computeContactHeat(contact, company) {
  const baseRel = Number(contact?.relevanceScore || 0);
  const baseScore = Number(company?.leadScore || 0);

  let recencyBoost = 0;
  const signals = Array.isArray(company?.signals) ? company.signals : [];
  const now = Date.now();
  for (const sig of signals) {
    const occurredAt = sig?.occurredAt ? new Date(sig.occurredAt).getTime() : null;
    if (!occurredAt || Number.isNaN(occurredAt)) continue;
    const days = (now - occurredAt) / DAY_MS;
    if (days <= 7) recencyBoost = Math.max(recencyBoost, 20);
    else if (days <= 30) recencyBoost = Math.max(recencyBoost, 10);
  }

  const heat = Math.round(0.5 * baseRel + 0.3 * baseScore + recencyBoost);
  return Math.max(0, Math.min(100, heat));
}

export function computeSegmentMetrics(companies, segmentId) {
  const safeCompanies = Array.isArray(companies) ? companies : [];
  let companyCount = 0;
  let contactCount = 0;
  let hotCount = 0;
  let warmCount = 0;
  let scoreSum = 0;

  for (const company of safeCompanies) {
    const contacts = Array.isArray(company?.contacts) ? company.contacts : [];
    const segmentContacts = contacts.filter((c) => getSegmentForContact(c) === segmentId);
    if (segmentContacts.length === 0) continue;

    companyCount += 1;
    contactCount += segmentContacts.length;
    scoreSum += Number(company.leadScore || 0);

    for (const contact of segmentContacts) {
      const heat = computeContactHeat(contact, company);
      if (heat >= 75) hotCount += 1;
      else if (heat >= 50) warmCount += 1;
    }
  }

  const avgScore = companyCount > 0 ? Math.round(scoreSum / companyCount) : 0;

  return {
    companies: companyCount,
    contacts: contactCount,
    hotCount,
    warmCount,
    avgScore,
    topSignal: getTopSignalForSegment(safeCompanies, segmentId)
  };
}

export function getTopSignalForSegment(companies, segmentId) {
  const safeCompanies = Array.isArray(companies) ? companies : [];
  const now = Date.now();
  const sixtyDaysAgo = now - 60 * DAY_MS;
  let best = null;

  for (const company of safeCompanies) {
    const contacts = Array.isArray(company?.contacts) ? company.contacts : [];
    const inSegment = contacts.some((c) => getSegmentForContact(c) === segmentId);
    if (!inSegment) continue;

    const signals = Array.isArray(company?.signals) ? company.signals : [];
    for (const sig of signals) {
      const occurredAt = sig?.occurredAt ? new Date(sig.occurredAt).getTime() : null;
      if (!occurredAt || Number.isNaN(occurredAt) || occurredAt < sixtyDaysAgo) continue;

      const impact = Number(sig.scoreImpact || 0);
      if (!best || impact > best.scoreImpact) {
        best = {
          type: sig.type || 'signal',
          severity: sig.severity || null,
          scoreImpact: impact,
          details: sig.details || sig.description || 'Signal detected',
          daysAgo: Math.max(0, Math.round((now - occurredAt) / DAY_MS)),
          companyName: company.name || company.company || 'Unknown',
          companyId: company.id || null
        };
      }
    }
  }

  return best;
}

export function sortContactsBy(contacts, mode, companiesById = {}) {
  const list = Array.isArray(contacts) ? [...contacts] : [];
  const cmpModes = {
    heat: (a, b) => {
      const ca = companiesById[a.companyId] || a._company;
      const cb = companiesById[b.companyId] || b._company;
      return computeContactHeat(b, cb) - computeContactHeat(a, ca);
    },
    score: (a, b) => {
      const ca = companiesById[a.companyId] || a._company;
      const cb = companiesById[b.companyId] || b._company;
      return Number(cb?.leadScore || 0) - Number(ca?.leadScore || 0);
    },
    recent: (a, b) => {
      const ca = companiesById[a.companyId] || a._company;
      const cb = companiesById[b.companyId] || b._company;
      return mostRecentSignalTime(cb) - mostRecentSignalTime(ca);
    },
    alpha: (a, b) => {
      const an = (a.name || '').toLowerCase();
      const bn = (b.name || '').toLowerCase();
      return an.localeCompare(bn);
    }
  };
  const cmp = cmpModes[mode] || cmpModes.heat;
  list.sort(cmp);
  return list;
}

function mostRecentSignalTime(company) {
  const signals = Array.isArray(company?.signals) ? company.signals : [];
  let max = 0;
  for (const sig of signals) {
    const t = sig?.occurredAt ? new Date(sig.occurredAt).getTime() : 0;
    if (!Number.isNaN(t) && t > max) max = t;
  }
  return max;
}

export function computeWorkingCapital(annualCargoes, avgCargoValue, settlementDays = 20) {
  const cargoes = Number(annualCargoes) || 0;
  const value = Number(avgCargoValue) || 0;
  const days = Number(settlementDays) || 0;
  const locked = Math.round((cargoes * value * days) / 365);
  const lcCostLow = Math.round(cargoes * value * 0.005);
  const lcCostHigh = Math.round(cargoes * value * 0.02);
  return { locked, lcCostLow, lcCostHigh };
}

export function getCompanyWorkingCapital(company) {
  if (!company) return null;
  const cargoes = Number(company.annualCargoes ?? company.insights?.cargoes ?? 0);
  const value = Number(company.avgCargoValue ?? company.insights?.avgCargoValue ?? 0);
  if (!cargoes || !value) return null;
  return computeWorkingCapital(cargoes, value);
}

const CURRENCY_FMT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

export function formatCurrency(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '$0';
  return CURRENCY_FMT.format(num);
}

export function formatCurrencyShort(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num === 0) return '$0';
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${sign}$${Math.round(abs)}`;
}

const PIPELINE_KEYWORDS = ['naesb', 'pipeline', 'nomination', 'midstream', 'gathering'];
const STORAGE_KEYWORDS = ['storage', 'tank', 'terminal', 'cushing', 'rotterdam'];
const INSPECTION_NAMES = ['sgs', 'bureau veritas', 'intertek', 'cotecna', 'inspectorate'];
const HUB_REGIONS = ['houston', 'cushing', 'rotterdam', 'singapore', 'london'];

export function inferPillarReadiness(company) {
  if (!company) {
    return defaultReadiness();
  }

  const segment = company.segment || (company.contacts || []).map((c) => getSegmentForContact(c))[0];
  const newsBlob = (Array.isArray(company.news) ? company.news : [])
    .map((n) => `${n.title || ''} ${n.source || ''}`)
    .join(' ')
    .toLowerCase();
  const locationBlob = `${company.location || ''} ${company.region || ''}`.toLowerCase();
  const inHub = HUB_REGIONS.some((h) => locationBlob.includes(h));

  const pipelineMatch = PIPELINE_KEYWORDS.some((k) => newsBlob.includes(k));
  const storageMatch = STORAGE_KEYWORDS.some((k) => newsBlob.includes(k));
  const inspectionMatch = INSPECTION_NAMES.some((k) => newsBlob.includes(k));

  return {
    pipeline: segment === 'midstream' || pipelineMatch
      ? { status: 'compatible', note: segment === 'midstream' ? 'Midstream operator — pipeline nominations native.' : 'Pipeline / NAESB references in recent activity.' }
      : segment === 'energy_traders' && inHub
        ? { status: 'likely', note: `Energy trader in ${capFirst(locationBlob.split(' ')[0])} hub — likely NAESB-connected.` }
        : { status: 'unknown', note: 'No pipeline / NAESB signal detected.' },

    storage: storageMatch
      ? { status: 'compatible', note: 'Storage / terminal references in recent activity.' }
      : segment === 'midstream'
        ? { status: 'likely', note: 'Midstream operator — terminal storage typical.' }
        : { status: 'unknown', note: 'No storage / terminal signal detected.' },

    inspection: segment === 'inspection' || inspectionMatch
      ? { status: 'compatible', note: segment === 'inspection' ? 'Independent inspection company.' : 'Established inspection partner referenced.' }
      : segment === 'energy_traders'
        ? { status: 'likely', note: 'Trading houses typically use SGS / Bureau Veritas / Intertek.' }
        : { status: 'unknown', note: 'No inspection partner signal detected.' },

    billOfLading: { status: 'unknown', note: 'Paper bill of lading remains industry default.' }
  };
}

function defaultReadiness() {
  return {
    pipeline: { status: 'unknown', note: 'No pipeline data available.' },
    storage: { status: 'unknown', note: 'No storage data available.' },
    inspection: { status: 'unknown', note: 'No inspection data available.' },
    billOfLading: { status: 'unknown', note: 'No bill of lading data available.' }
  };
}

function capFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function getSegmentLabel(segmentId) {
  return LAMINAR_SEGMENTS[segmentId]?.label || segmentId;
}

export function getSegmentDescription(segmentId) {
  return LAMINAR_SEGMENTS[segmentId]?.description || '';
}

export const SEGMENT_ICONS = {
  energy_traders: '🛢️',
  banks: '🏦',
  midstream: '⚙️',
  inspection: '🔍'
};

export { LAMINAR_SEGMENT_ORDER, LAMINAR_SEGMENTS };
