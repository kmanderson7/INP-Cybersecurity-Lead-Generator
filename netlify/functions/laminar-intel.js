import { errorResponse, successResponse } from '../lib/http.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { requireLiveDataEnabled } from '../lib/source.js';
import { get, set, getCacheKey } from '../lib/cache.js';
import { fetchWithRetry } from '../lib/http.js';
import OpenAI from 'openai';
import { createHash } from 'crypto';

const NEWS_BASE = 'https://newsapi.org/v2/everything';
const EDGAR_SEARCH = 'https://efts.sec.gov/LATEST/search-index';

// Forbidden words from the Laminar linguistic guardrails
const FORBIDDEN = ['crypto', 'cryptocurrency', 'blockchain', 'xrp', 'xrpl', 'nft', 'token', 'ledger', 'defi', 'web3', 'digital asset'];

const LAMINAR_NEWS_QUERIES = [
  '"letter of credit" "crude oil"',
  '"trade settlement" commodity oil',
  '"cargo financing" petroleum',
  '"commodity trading" "working capital"',
  '"oil trading" settlement',
  '"trade finance" "physical crude"'
];

const LAMINAR_SEC_QUERIES = [
  '"letter of credit" "crude oil"',
  '"commodity trading" "settlement" "cargo"',
  '"trade finance" petroleum oil'
];

const AI_SYSTEM_PROMPT = `You are a trade finance intelligence analyst for Laminar Digital.
Laminar replaces the Letter of Credit process with programmable settlement for physical crude oil.
Your job: from the provided news articles and SEC filings, identify companies that handle physical crude oil trading, cargo financing, or commodity settlement.

For each distinct real company you identify, return ONE JSON object. Return a JSON array only — no markdown fences.

Schema per object:
{
  "organizationName": "string — full company name",
  "organizationDomain": "string — best-guess root domain (e.g. vitol.com)",
  "segment": "energy_traders | banks | midstream | inspection",
  "contactTitle": "string — most relevant decision-maker title (CFO / Treasurer / Head of Trade Finance / VP Commercial / etc.)",
  "signalDetails": "string — one sentence explaining why this company needs Laminar NOW",
  "signalType": "news | sec_filing | market_signal",
  "urgencyScore": 0-100,
  "employeeEstimate": number,
  "sourceRef": "string — article headline or SEC entity that surfaced this company"
}

HARD RULES:
- Only real, named companies. No generic descriptions.
- Never use: crypto, blockchain, token, ledger, DeFi, Web3, XRP, XRPL, NFT, digital asset.
- Maximum 15 companies.
- If unsure of domain, make a reasonable guess (e.g. companyname.com).`;

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } };
  }
  if (event.httpMethod !== 'POST') return errorResponse('Method Not Allowed', 405);

  const clientIP = event.headers['x-forwarded-for'] || 'anonymous';
  const rate = checkRateLimit(`laminar_intel_${clientIP}`, 20, 60 * 60 * 1000);
  if (!rate.allowed) return errorResponse('Rate limit exceeded', 429);

  const newsKey = process.env.NEWS_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!newsKey && !openaiKey && requireLiveDataEnabled()) {
    return errorResponse('Intelligence sources not configured', 503, {
      source: 'provider_fallback',
      provider: 'laminar_intel',
      reason: 'REQUIRE_LIVE_DATA blocked laminar-intel fallback. Set NEWS_API_KEY and/or OPENAI_API_KEY.'
    });
  }

  const body = JSON.parse(event.body || '{}');
  const segmentId = body.segmentId || 'all';
  const cacheKey = getCacheKey('laminar', 'intel', { segmentId, date: new Date().toISOString().slice(0, 10) });
  const cached = get(cacheKey);
  if (cached) return successResponse(cached, { source: 'cache', provider: 'laminar_intel', confidence: 0.8 });

  try {
    const [articles, filings] = await Promise.all([
      newsKey ? fetchNewsIntel(newsKey) : Promise.resolve([]),
      fetchSecIntel()
    ]);

    let people;
    if (openaiKey && (articles.length > 0 || filings.length > 0)) {
      people = await synthesizeWithAI(articles, filings, openaiKey);
    } else {
      people = buildBasicPeople(articles, filings);
    }

    people = people.filter(p => p.organizationName && p.organizationName.length > 1);
    people = people.map(p => ({ ...p, signalDetails: scrubForbidden(p.signalDetails || '') }));

    const payload = { people };
    set(cacheKey, payload, 2 * 60 * 60 * 1000);

    return successResponse(payload, {
      source: openaiKey ? 'provider_live' : 'provider_fallback',
      provider: 'laminar_intel',
      live: Boolean(newsKey || openaiKey),
      confidence: openaiKey ? 0.78 : 0.42
    });
  } catch (err) {
    console.error('[laminar-intel] error:', err);
    return errorResponse(err.message || 'Laminar intelligence scan failed', 500);
  }
}

async function fetchNewsIntel(newsKey) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const allArticles = [];
  const seen = new Set();

  for (const q of LAMINAR_NEWS_QUERIES.slice(0, 4)) {
    try {
      const params = new URLSearchParams({
        q,
        from: sevenDaysAgo,
        sortBy: 'publishedAt',
        pageSize: '10',
        language: 'en'
      });
      const res = await fetchWithRetry(`${NEWS_BASE}?${params}`, {
        headers: { 'X-Api-Key': newsKey }
      }, 2, 8000);
      const data = await res.json();
      for (const article of data.articles || []) {
        const key = article.url || article.title;
        if (!seen.has(key)) {
          seen.add(key);
          allArticles.push({
            title: article.title || '',
            description: article.description || '',
            source: article.source?.name || '',
            url: article.url || '',
            publishedAt: article.publishedAt || new Date().toISOString()
          });
        }
      }
    } catch (e) {
      console.warn(`[laminar-intel] news query failed: ${q}`, e.message);
    }
  }

  return allArticles;
}

async function fetchSecIntel() {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const filings = [];

  for (const q of LAMINAR_SEC_QUERIES.slice(0, 2)) {
    try {
      const params = new URLSearchParams({
        q,
        forms: '10-K,10-Q,8-K',
        dateRange: 'custom',
        startdt: ninetyDaysAgo
      });
      const res = await fetchWithRetry(`${EDGAR_SEARCH}?${params}`, {
        headers: { 'User-Agent': 'Laminar Digital intel@laminar.finance' }
      }, 2, 10000);
      const data = await res.json();
      for (const hit of data?.hits?.hits || []) {
        const src = hit._source || {};
        if (src.entity_name) {
          filings.push({
            entityName: src.entity_name,
            fileDate: src.file_date || '',
            formType: src.form_type || ''
          });
        }
      }
    } catch (e) {
      console.warn('[laminar-intel] SEC query failed:', e.message);
    }
  }

  // Dedupe by entity name
  const seen = new Set();
  return filings.filter(f => {
    if (seen.has(f.entityName)) return false;
    seen.add(f.entityName);
    return true;
  });
}

async function synthesizeWithAI(articles, filings, apiKey) {
  const openai = new OpenAI({ apiKey });

  const articleBlock = articles.slice(0, 20).map(a =>
    `[NEWS] ${a.source}: "${a.title}" — ${a.description || ''}`.slice(0, 300)
  ).join('\n');

  const filingBlock = filings.slice(0, 20).map(f =>
    `[SEC ${f.formType} ${f.fileDate}] ${f.entityName}`
  ).join('\n');

  const userMessage = `Analyze these sources and return a JSON array of companies:\n\n${articleBlock}\n\n${filingBlock}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 2500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ]
    });

    const raw = completion.choices[0].message.content;
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : (parsed.companies || parsed.results || Object.values(parsed)[0] || []);
    return list.filter(Boolean).map(item => buildPersonFromAI(item));
  } catch (e) {
    console.warn('[laminar-intel] OpenAI synthesis failed, falling back:', e.message);
    return buildBasicPeople(articles, filings);
  }
}

function buildPersonFromAI(item) {
  const domain = (item.organizationDomain || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const id = `intel_${createHash('md5').update(item.organizationName + domain).digest('hex').slice(0, 8)}`;
  const occurredAt = new Date().toISOString();

  return {
    id,
    firstName: item.contactTitle || 'Head of',
    lastName: 'Trade Finance',
    name: item.contactTitle || 'Head of Trade Finance',
    title: item.contactTitle || 'Head of Trade Finance',
    email: null,
    organizationName: item.organizationName,
    organizationDomain: domain,
    relevanceScore: Math.min(100, Math.max(0, Number(item.urgencyScore) || 60)),
    segment: item.segment || 'energy_traders',
    intelSource: item.signalType === 'sec_filing' ? 'sec' : 'news',
    organization: {
      name: item.organizationName,
      primary_domain: domain,
      industry: segmentToIndustry(item.segment),
      estimated_num_employees: Number(item.employeeEstimate) || 500,
      signals: [{
        type: item.signalType || 'market_signal',
        severity: item.urgencyScore >= 70 ? 'high' : item.urgencyScore >= 40 ? 'medium' : 'low',
        scoreImpact: Math.round((Number(item.urgencyScore) || 50) * 0.4),
        details: scrubForbidden(item.signalDetails || `${item.organizationName} identified via ${item.intelSource || 'market intelligence'}.`),
        evidence: [item.sourceRef || ''],
        occurredAt
      }],
      news: item.sourceRef ? [{
        title: item.sourceRef,
        source: item.signalType === 'sec_filing' ? 'SEC EDGAR' : 'News Intelligence',
        date: new Date().toISOString().split('T')[0],
        url: ''
      }] : []
    },
    sourceMeta: {
      source: 'provider_live',
      provider: 'laminar_intel',
      live: true,
      confidence: 0.72
    }
  };
}

function buildBasicPeople(articles, filings) {
  const people = [];
  const seen = new Set();

  // Extract from SEC filings — highest confidence since these are real companies
  for (const filing of filings.slice(0, 10)) {
    const name = filing.entityName;
    if (seen.has(name)) continue;
    seen.add(name);
    const domain = guessedDomain(name);
    const id = `intel_sec_${createHash('md5').update(name).digest('hex').slice(0, 8)}`;
    people.push({
      id,
      name: 'Treasurer',
      firstName: 'Treasurer',
      lastName: '',
      title: 'Treasurer',
      email: null,
      organizationName: name,
      organizationDomain: domain,
      relevanceScore: 65,
      segment: guessSegment(name),
      intelSource: 'sec',
      organization: {
        name,
        primary_domain: domain,
        industry: 'Energy / Commodity Trading',
        estimated_num_employees: 500,
        signals: [{
          type: 'sec_filing',
          severity: 'medium',
          scoreImpact: 25,
          details: `${name} referenced crude oil letter of credit in a recent ${filing.formType} filing (${filing.fileDate}).`,
          evidence: [`SEC EDGAR: ${filing.formType} ${filing.fileDate}`],
          occurredAt: filing.fileDate ? new Date(filing.fileDate).toISOString() : new Date().toISOString()
        }],
        news: [{
          title: `${filing.formType} filing: crude oil LC reference`,
          source: 'SEC EDGAR',
          date: filing.fileDate || '',
          url: ''
        }]
      },
      sourceMeta: { source: 'provider_live', provider: 'laminar_intel_sec', live: true, confidence: 0.55 }
    });
  }

  // Extract from news article sources
  for (const article of articles.slice(0, 8)) {
    const name = article.source;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const domain = guessedDomain(name);
    const id = `intel_news_${createHash('md5').update(name + article.url).digest('hex').slice(0, 8)}`;
    people.push({
      id,
      name: 'CFO',
      firstName: 'CFO',
      lastName: '',
      title: 'Chief Financial Officer',
      email: null,
      organizationName: name,
      organizationDomain: domain,
      relevanceScore: 55,
      segment: guessSegment(name),
      intelSource: 'news',
      organization: {
        name,
        primary_domain: domain,
        industry: 'Energy / Trade Finance',
        estimated_num_employees: 200,
        signals: [{
          type: 'market_signal',
          severity: 'low',
          scoreImpact: 15,
          details: scrubForbidden(`${article.title || name} — commodity trade finance signal detected.`),
          evidence: [article.url || ''],
          occurredAt: article.publishedAt || new Date().toISOString()
        }],
        news: [{ title: article.title, source: article.source, date: article.publishedAt?.split('T')[0] || '', url: article.url }]
      },
      sourceMeta: { source: 'provider_fallback', provider: 'laminar_intel_news', live: false, confidence: 0.35 }
    });
  }

  return people;
}

function segmentToIndustry(segment) {
  const map = {
    energy_traders: 'Commodity Trading',
    banks: 'Trade Finance / Banking',
    midstream: 'Midstream Energy',
    inspection: 'Inspection Services'
  };
  return map[segment] || 'Energy';
}

function guessSegment(name) {
  const l = (name || '').toLowerCase();
  if (/bank|financial|credit|capital|finance/.test(l)) return 'banks';
  if (/pipeline|midstream|terminal|transport|storage/.test(l)) return 'midstream';
  if (/inspect|certif|veritas|bureau|intertek|sgs/.test(l)) return 'inspection';
  return 'energy_traders';
}

function guessedDomain(name) {
  return (name || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join('') + '.com';
}

function scrubForbidden(text) {
  if (!text) return text;
  let out = text;
  for (const word of FORBIDDEN) {
    const re = new RegExp(word, 'gi');
    out = out.replace(re, 'programmable settlement');
  }
  return out;
}
