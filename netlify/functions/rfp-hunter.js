import { jsonResponse, errorResponse, fetchWithRetry, successResponse } from '../lib/http.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { get, set, getCacheKey } from '../lib/cache.js';
import { createSignal } from '../lib/normalize.js';
import { randomUUID } from 'crypto';
import {
  attachSignalMeta,
  logProviderEvent,
  requireLiveDataEnabled
} from '../lib/source.js';

const PROCUREMENT_KEYWORDS = [
  'trade finance',
  'settlement',
  'treasury',
  'payments',
  'reconciliation',
  'commodity',
  'middle office',
  'working capital'
];

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      }
    };
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse('Method Not Allowed', 405, {
      source: 'provider_fallback',
      provider: 'rfp_hunter'
    });
  }

  const clientIP = event.headers['client-ip'] || event.headers['x-forwarded-for'] || 'anonymous';
  const rateCheck = checkRateLimit(`rfp_${clientIP}`, 25, 60 * 60 * 1000);

  if (!rateCheck.allowed) {
    return errorResponse('Rate limit exceeded', 429, {
      source: 'provider_fallback',
      provider: 'rfp_hunter'
    });
  }

  try {
    const { domain, company, industry } = JSON.parse(event.body || '{}');

    const cacheKey = getCacheKey(domain || company || industry || 'rfp', 'search', { industry, company });
    const cached = get(cacheKey);
    if (cached) {
      return jsonResponse(cached);
    }

    const liveResult = await searchLiveRfps(company, industry);
    if (liveResult) {
      const response = successResponse(liveResult.data, liveResult.meta);
      set(cacheKey, JSON.parse(response.body), 8 * 60 * 60 * 1000);
      return response;
    }

    if (requireLiveDataEnabled()) {
      return errorResponse('Live RFP data is required but SAM.gov is not configured or reachable.', 503, {
        source: 'provider_fallback',
        provider: 'rfp_hunter',
        reason: 'REQUIRE_LIVE_DATA blocked heuristic RFP fallback.'
      });
    }

    const signals = attachSignalMeta(
      await huntFallbackRfps(domain, company, industry),
      {
        source: 'provider_fallback',
        provider: 'rfp_scrape',
        confidence: 0.54
      }
    );

    const response = successResponse(
      { signals },
      {
        source: 'provider_fallback',
        provider: 'rfp_scrape',
        reason: 'Used procurement-page scraping because live SAM.gov data was unavailable.',
        confidence: 0.54
      }
    );

    set(cacheKey, JSON.parse(response.body), 8 * 60 * 60 * 1000);
    return response;
  } catch (error) {
    console.error('Error in rfp-hunter:', error);
    return errorResponse('Failed to hunt RFPs', 500, {
      source: 'provider_fallback',
      provider: 'rfp_hunter'
    });
  }
}

async function searchLiveRfps(company, industry) {
  if (!process.env.SAM_GOV_API_KEY) {
    return null;
  }

  const correlationId = randomUUID();
  const startedAt = Date.now();

  try {
    const opportunities = await fetchSamGovOpportunities(company, industry);
    const rawSignals = opportunities.map((opportunity) => opportunityToSignal(opportunity)).filter(Boolean);
    const signals = attachSignalMeta(rawSignals, {
      source: 'provider_live',
      provider: 'sam_gov',
      confidence: rawSignals.length ? 0.82 : 0.76,
      correlationId
    });

    logProviderEvent({
      functionName: 'rfp-hunter',
      provider: 'sam_gov',
      correlationId,
      startedAt,
      status: 'success',
      reason: `results=${opportunities.length} signals=${signals.length}`
    });

    return {
      data: {
        signals,
        opportunities: opportunities.slice(0, 6).map((item) => ({
          noticeId: item.noticeId,
          title: item.title,
          department: item.department || item.fullParentPathName,
          dueDate: extractResponseDate(item),
          postedDate: item.postedDate,
          link: item.uiLink || item.link || item.resourceLinks?.[0]?.href || null
        }))
      },
      meta: {
        source: 'provider_live',
        provider: 'sam_gov',
        reason: signals.length
          ? 'Live opportunities were pulled from SAM.gov.'
          : 'SAM.gov returned no active trade-finance or settlement opportunities for the current search window.',
        confidence: signals.length ? 0.82 : 0.76,
        correlationId
      }
    };
  } catch (error) {
    logProviderEvent({
      functionName: 'rfp-hunter',
      provider: 'sam_gov',
      correlationId,
      startedAt,
      status: 'failure',
      reason: 'request_failed'
    });
    return null;
  }
}

async function fetchSamGovOpportunities(company, industry) {
  const postedTo = new Date();
  const postedFrom = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const formattedFrom = formatSamDate(postedFrom);
  const formattedTo = formatSamDate(postedTo);

  const searchTerms = [
    industry === 'Finance' ? 'trade finance' : null,
    company ? `${company} settlement` : null,
    'trade finance',
    'settlement',
    'treasury',
    'payments'
  ].filter(Boolean);

  const results = [];
  for (const term of searchTerms.slice(0, 3)) {
    const url = `https://api.sam.gov/opportunities/v2/search?api_key=${encodeURIComponent(process.env.SAM_GOV_API_KEY)}&postedFrom=${encodeURIComponent(formattedFrom)}&postedTo=${encodeURIComponent(formattedTo)}&limit=10&offset=0&ptype=o&title=${encodeURIComponent(term)}`;
    const response = await fetchWithRetry(url, {}, 2, 12000);
    const payload = await response.json();
    const opportunities = Array.isArray(payload.opportunitiesData) ? payload.opportunitiesData : [];
    results.push(...opportunities);
  }

  const unique = new Map();
  for (const opportunity of results) {
    if (matchesProcurementFocus(opportunity) && !unique.has(opportunity.noticeId)) {
      unique.set(opportunity.noticeId, opportunity);
    }
  }

  return Array.from(unique.values()).slice(0, 10);
}

function formatSamDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

function matchesProcurementFocus(opportunity = {}) {
  const text = `${opportunity.title || ''} ${opportunity.description || ''}`.toLowerCase();
  return PROCUREMENT_KEYWORDS.some((keyword) => text.includes(keyword));
}

function opportunityToSignal(opportunity) {
  const dueDate = extractResponseDate(opportunity);
  const postedDate = opportunity.postedDate ? new Date(opportunity.postedDate) : null;
  const daysToDue = dueDate ? Math.max(0, Math.round((new Date(dueDate) - Date.now()) / (1000 * 60 * 60 * 24))) : null;
  const severity = daysToDue !== null && daysToDue <= 30 ? 'high' : 'medium';
  const scoreImpact = daysToDue !== null && daysToDue <= 30 ? 34 : 26;
  const evidence = [
    opportunity.solicitationNumber ? `Solicitation: ${opportunity.solicitationNumber}` : null,
    postedDate ? `Posted: ${postedDate.toISOString().slice(0, 10)}` : null,
    dueDate ? `Due: ${dueDate}` : 'Response deadline unavailable',
    opportunity.uiLink || opportunity.link || null
  ].filter(Boolean);

  return createSignal(
    'rfp',
    severity,
    scoreImpact,
    `${opportunity.title} (${opportunity.department || opportunity.fullParentPathName || 'SAM.gov'})`,
    evidence,
    { confidence: 0.82 }
  );
}

function extractResponseDate(opportunity = {}) {
  const candidates = [
    opportunity.responseDeadLine,
    opportunity.responseDeadline,
    opportunity.archiveDate,
    opportunity.closeDate
  ].filter(Boolean);

  for (const candidate of candidates) {
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return null;
}

async function huntFallbackRfps(domain, company, industry) {
  const signals = [];

  try {
    const companySignals = await checkCompanyProcurementPages(domain);
    signals.push(...companySignals);

    const industrySignals = generateIndustryFallback(industry);
    signals.push(...industrySignals);

    const readinessSignals = await checkProcurementReadiness(domain, company);
    signals.push(...readinessSignals);
  } catch (error) {
    console.error('Error hunting fallback RFPs:', error);
  }

  return signals;
}

async function checkCompanyProcurementPages(domain) {
  if (!domain) {
    return [];
  }

  const signals = [];
  const procurementPages = [
    '/procurement',
    '/rfp',
    '/vendor',
    '/suppliers',
    '/sourcing',
    '/purchasing',
    '/contracts'
  ];

  for (const page of procurementPages) {
    try {
      const url = `https://${domain}${page}`;
      const response = await fetchWithRetry(url, {
        headers: {
          'User-Agent': process.env.USER_AGENT || 'INP2-LeadGen-Bot/1.0'
        }
      }, 1, 5000);

      if (response.ok) {
        const html = await response.text();
        signals.push(...parseRfpContent(html, url));
      }
    } catch {
      continue;
    }
  }

  return signals;
}

function parseRfpContent(html, sourceUrl) {
  const lowerHtml = html.toLowerCase();
  const hasRfpLanguage = ['request for proposal', 'rfp', 'rfq', 'vendor selection', 'solicitation']
    .some((indicator) => lowerHtml.includes(indicator));
  const focusHits = PROCUREMENT_KEYWORDS.filter((keyword) => lowerHtml.includes(keyword));

  if (!hasRfpLanguage || focusHits.length === 0) {
    return [];
  }

  return [
    createSignal(
      'rfp',
      'medium',
      22,
      `Procurement page shows ${focusHits.length} trade-finance or settlement buying signals`,
      [sourceUrl],
      { confidence: 0.54 }
    )
  ];
}

function generateIndustryFallback(industry) {
  if (!industry) {
    return [];
  }

  const focusAreas = {
    Finance: 'treasury transformation',
    Manufacturing: 'commodity settlement operations',
    Energy: 'trade settlement workflows',
    Software: 'payments operations modernization'
  };

  const focus = focusAreas[industry] || 'finance operations modernization';

  return [
    createSignal(
      'rfp',
      'medium',
      24,
      `${industry} procurement activity indicates active interest in ${focus}`,
      ['industry procurement heuristics'],
      { confidence: 0.5 }
    )
  ];
}

async function checkProcurementReadiness(domain, company) {
  if (!domain) {
    return [];
  }

  try {
    const url = `https://${domain}`;
    const response = await fetchWithRetry(url, {
      headers: {
        'User-Agent': process.env.USER_AGENT || 'INP2-LeadGen-Bot/1.0'
      }
    }, 1, 5000);

    if (!response.ok) {
      return [];
    }

    const html = await response.text();
    const indicators = [
      'vendor registration',
      'supplier portal',
      'procurement process',
      'payment operations',
      'reconciliation',
      'trade finance'
    ].filter((indicator) => html.toLowerCase().includes(indicator));

    if (indicators.length < 2) {
      return [];
    }

    return [
      createSignal(
        'rfp',
        'low',
        16,
        `${company || 'Company'} appears procurement-ready with ${indicators.length} finance operations indicators`,
        [url],
        { confidence: 0.5 }
      )
    ];
  } catch {
    return [];
  }
}
