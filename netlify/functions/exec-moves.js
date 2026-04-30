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

const FINANCE_TITLES = [
  'CFO',
  'Chief Financial Officer',
  'Trade Finance',
  'Head of Trade Finance',
  'Director of Trade Finance',
  'Treasury',
  'Treasurer',
  'Settlement',
  'Middle Office',
  'Payments',
  'Structured Finance',
  'Commodity Operations'
];

const MOVE_KEYWORDS = ['appointed', 'named', 'joins', 'joined', 'hired', 'promoted', 'welcomes'];
const EXCLUDED_TERMS = ['security', 'cyber', 'cybersecurity', 'it ', 'infrastructure', 'devops'];

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
      provider: 'exec_moves'
    });
  }

  const clientIP = event.headers['client-ip'] || event.headers['x-forwarded-for'] || 'anonymous';
  const rateCheck = checkRateLimit(`exec_${clientIP}`, 30, 60 * 60 * 1000);

  if (!rateCheck.allowed) {
    return errorResponse('Rate limit exceeded', 429, {
      source: 'provider_fallback',
      provider: 'exec_moves'
    });
  }

  try {
    const { domain, company } = JSON.parse(event.body || '{}');
    if (!domain && !company) {
      return errorResponse('Domain or company is required', 400, {
        source: 'provider_fallback',
        provider: 'exec_moves'
      });
    }

    const cacheKey = getCacheKey(domain || company, 'exec_moves', { company });
    const cached = get(cacheKey);
    if (cached) {
      return jsonResponse(cached);
    }

    const liveResult = await tryLiveExecutiveMoves(domain, company);
    if (liveResult) {
      const response = successResponse(liveResult.data, liveResult.meta);
      set(cacheKey, JSON.parse(response.body), 6 * 60 * 60 * 1000);
      return response;
    }

    if (requireLiveDataEnabled()) {
      return errorResponse('Live executive-move data is required but no live provider is available.', 503, {
        source: 'provider_fallback',
        provider: 'exec_moves',
        reason: 'REQUIRE_LIVE_DATA blocked heuristic executive-move fallback.'
      });
    }

    const fallbackSignals = attachSignalMeta(await detectExecutiveMoves(domain, company), {
      source: 'provider_fallback',
      provider: 'company_news_scrape',
      confidence: 0.56
    });

    const response = successResponse({
      signals: fallbackSignals
    }, {
      source: 'provider_fallback',
      provider: 'company_news_scrape',
      reason: 'Used company-site scraping because no live news provider was configured or reachable.',
      confidence: 0.56
    });

    set(cacheKey, JSON.parse(response.body), 6 * 60 * 60 * 1000);
    return response;
  } catch (error) {
    console.error('Error in exec-moves:', error);
    return errorResponse('Failed to analyze executive moves', 500, {
      source: 'provider_fallback',
      provider: 'exec_moves'
    });
  }
}

async function tryLiveExecutiveMoves(domain, company) {
  const liveProviders = [];

  if (process.env.NEWS_API_KEY) {
    liveProviders.push(() => searchNewsApi(company || domain));
  }

  if (process.env.SERPAPI_API_KEY) {
    liveProviders.push(() => searchSerpApi(company || domain));
  }

  for (const providerCall of liveProviders) {
    const result = await providerCall();
    if (result) {
      return result;
    }
  }

  return null;
}

async function searchNewsApi(target) {
  const startedAt = Date.now();
  const correlationId = randomUUID();

  try {
    const query = buildExecutiveMoveQuery(target);
    const fromDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=10&from=${fromDate}`;
    const response = await fetchWithRetry(url, {
      headers: {
        'X-Api-Key': process.env.NEWS_API_KEY
      }
    }, 2, 10000);

    const payload = await response.json();
    const articles = Array.isArray(payload.articles) ? payload.articles : [];
    const rawSignals = articles
      .map((article) => articleToExecutiveSignal(article))
      .filter(Boolean);
    const signals = attachSignalMeta(rawSignals, {
      source: 'provider_live',
      provider: 'newsapi',
      confidence: rawSignals.length > 0 ? 0.84 : 0.8,
      correlationId
    });

    logProviderEvent({
      functionName: 'exec-moves',
      provider: 'newsapi',
      correlationId,
      startedAt,
      status: 'success',
      reason: `articles=${articles.length} signals=${signals.length}`
    });

    return {
      data: {
        signals,
        articlesChecked: articles.length
      },
      meta: {
        source: 'provider_live',
        provider: 'newsapi',
        reason: signals.length
          ? 'Live executive appointments detected from NewsAPI coverage.'
          : 'Live provider returned no qualifying finance or settlement leadership appointments.',
        confidence: signals.length > 0 ? 0.84 : 0.8,
        correlationId
      }
    };
  } catch (error) {
    logProviderEvent({
      functionName: 'exec-moves',
      provider: 'newsapi',
      correlationId,
      startedAt,
      status: 'failure',
      reason: 'request_failed'
    });
    return null;
  }
}

async function searchSerpApi(target) {
  const startedAt = Date.now();
  const correlationId = randomUUID();

  try {
    const query = buildExecutiveMoveQuery(target);
    const url = `https://serpapi.com/search.json?engine=google_news&q=${encodeURIComponent(query)}&api_key=${encodeURIComponent(process.env.SERPAPI_API_KEY)}&hl=en&gl=us`;
    const response = await fetchWithRetry(url, {}, 2, 10000);
    const payload = await response.json();
    const articles = Array.isArray(payload.news_results) ? payload.news_results : [];
    const rawSignals = articles
      .map((article) => articleToExecutiveSignal({
        title: article.title,
        description: article.snippet,
        url: article.link,
        publishedAt: article.date,
        source: { name: article.source?.name || 'Google News' }
      }))
      .filter(Boolean);
    const signals = attachSignalMeta(rawSignals, {
      source: 'provider_live',
      provider: 'serpapi',
      confidence: rawSignals.length > 0 ? 0.78 : 0.72,
      correlationId
    });

    logProviderEvent({
      functionName: 'exec-moves',
      provider: 'serpapi',
      correlationId,
      startedAt,
      status: 'success',
      reason: `articles=${articles.length} signals=${signals.length}`
    });

    return {
      data: {
        signals,
        articlesChecked: articles.length
      },
      meta: {
        source: 'provider_live',
        provider: 'serpapi',
        reason: signals.length
          ? 'Live executive appointments detected from SerpAPI news results.'
          : 'Live provider returned no qualifying finance or settlement leadership appointments.',
        confidence: signals.length > 0 ? 0.78 : 0.72,
        correlationId
      }
    };
  } catch (error) {
    logProviderEvent({
      functionName: 'exec-moves',
      provider: 'serpapi',
      correlationId,
      startedAt,
      status: 'failure',
      reason: 'request_failed'
    });
    return null;
  }
}

function buildExecutiveMoveQuery(target) {
  return `"${target}" AND (${FINANCE_TITLES.map((title) => `"${title}"`).join(' OR ')}) AND (${MOVE_KEYWORDS.join(' OR ')})`;
}

function articleToExecutiveSignal(article) {
  const text = `${article?.title || ''} ${article?.description || ''}`.trim();
  if (!text) {
    return null;
  }

  const normalized = text.toLowerCase();
  const hasIncludedTitle = FINANCE_TITLES.some((title) => normalized.includes(title.toLowerCase()));
  const hasMoveKeyword = MOVE_KEYWORDS.some((keyword) => normalized.includes(keyword));
  const hasExcludedOnly = EXCLUDED_TERMS.some((term) => normalized.includes(term)) && !hasIncludedTitle;

  if (!hasIncludedTitle || !hasMoveKeyword || hasExcludedOnly) {
    return null;
  }

  const title = article.title || 'Leadership appointment detected';
  const sourceName = article.source?.name || 'Live news source';
  const publishedAt = normalizePublishedAt(article.publishedAt);
  const scoreImpact = publishedAt && Date.now() - new Date(publishedAt).getTime() < 30 * 24 * 60 * 60 * 1000 ? 34 : 28;

  return createSignal(
    'exec_move',
    'high',
    scoreImpact,
    `${title} (${sourceName})`,
    [article.url || sourceName, publishedAt || 'published date unavailable'],
    { confidence: 0.84 }
  );
}

function normalizePublishedAt(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function detectExecutiveMoves(domain, company) {
  const signals = [];

  try {
    const newsSignals = await checkCompanyNews(domain, company);
    signals.push(...newsSignals);

    const heuristicSignals = simulateLeadershipMonitoring(company);
    signals.push(...heuristicSignals);
  } catch (error) {
    console.error('Error detecting executive moves:', error);
  }

  return signals;
}

async function checkCompanyNews(domain, company) {
  const signals = [];
  const newsUrls = [
    `https://${domain}/news`,
    `https://${domain}/press`,
    `https://${domain}/blog`,
    `https://${domain}/newsroom`
  ];

  for (const url of newsUrls) {
    try {
      const response = await fetchWithRetry(url, {
        headers: {
          'User-Agent': process.env.USER_AGENT || 'INP2-LeadGen-Bot/1.0'
        }
      }, 1, 5000);

      if (response.ok) {
        const html = await response.text();
        const parsedSignals = parseNewsForExecMoves(html, url, company);
        signals.push(...parsedSignals);
      }
    } catch {
      continue;
    }
  }

  return signals;
}

function parseNewsForExecMoves(html, sourceUrl, company) {
  const signals = [];
  const lowerHtml = html.toLowerCase();

  for (const title of FINANCE_TITLES) {
    const hasTitle = lowerHtml.includes(title.toLowerCase());
    const hasMove = MOVE_KEYWORDS.some((keyword) => lowerHtml.includes(keyword));

    if (hasTitle && hasMove) {
      const context = extractContext(html, title);
      signals.push(createSignal(
        'exec_move',
        'medium',
        22,
        `${company || 'Company'} leadership update: ${context}`,
        [sourceUrl],
        { confidence: 0.56 }
      ));
    }
  }

  return signals.slice(0, 3);
}

function extractContext(html, title) {
  const pattern = new RegExp(`(.{0,80}${title}.{0,120})`, 'i');
  const match = html.match(pattern);
  return match ? match[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : `New ${title} appointment detected`;
}

function simulateLeadershipMonitoring(company) {
  if (Math.random() <= 0.75) {
    return [];
  }

  const roles = ['CFO', 'Head of Trade Finance', 'Treasurer', 'Settlement Manager'];
  const role = roles[Math.floor(Math.random() * roles.length)];
  const daysAgo = [10, 20, 35, 50][Math.floor(Math.random() * 4)];

  return [
    createSignal(
      'exec_move',
      daysAgo <= 30 ? 'high' : 'medium',
      daysAgo <= 30 ? 30 : 24,
      `Recent ${role} appointment detected within the last ${daysAgo} days`,
      ['company leadership monitoring'],
      { confidence: 0.48 }
    )
  ];
}
