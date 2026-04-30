import { LAMINAR_SEGMENTS } from './laminarPilot.js';

const SEGMENT_KEYWORDS = {
  energy_traders: ['trade finance', 'settlement', 'treasury', 'working capital', 'commodity'],
  banks: ['commodity finance', 'digital assets', 'stablecoin', 'letter of credit', 'documentary credit', 'rlusd', 'transaction banking'],
  midstream: ['terminals', 'pipeline', 'scheduling', 'nominations', 'storage'],
  inspection: ['inspection', 'certification', 'oracle', 'cargo', 'oil and gas']
};

export function titlesForSegment(segment) {
  return LAMINAR_SEGMENTS[segment]?.titles ? [...LAMINAR_SEGMENTS[segment].titles] : [];
}

export function keywordsForSegment(segment) {
  return SEGMENT_KEYWORDS[segment] ? [...SEGMENT_KEYWORDS[segment]] : [];
}

export function mergeWithDefaults(segmentList = [], defaults = []) {
  const seen = new Set();
  const merged = [];
  for (const value of [...segmentList, ...defaults]) {
    if (!value) continue;
    const key = String(value).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(value);
  }
  return merged;
}
