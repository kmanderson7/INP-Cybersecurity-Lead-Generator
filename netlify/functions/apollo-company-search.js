import { jsonResponse, errorResponse, fetchWithRetry } from '../lib/http.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { get, set, getCacheKey } from '../lib/cache.js';
import { calculateScore, SCORING_PROFILES } from '../lib/normalize.js';
import { LAMINAR_SEGMENTS, LAMINAR_SEGMENT_ORDER } from '../lib/laminarPilot.js';
import { requireLiveDataEnabled } from '../lib/source.js';

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

function inferSegmentFromDomain(domain) {
  if (!domain) return null;
  const lower = String(domain).toLowerCase();
  for (const id of LAMINAR_SEGMENT_ORDER) {
    if (LAMINAR_SEGMENTS[id].domains.some((d) => lower.includes(d.replace(/\.com$/, '')))) {
      return id;
    }
  }
  return null;
}

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
    return errorResponse('Method Not Allowed', 405);
  }

  const clientIP = event.headers['client-ip'] || event.headers['x-forwarded-for'] || 'anonymous';
  const rateCheck = checkRateLimit(clientIP, 50, 60 * 60 * 1000);
  if (!rateCheck.allowed) {
    return errorResponse('Rate limit exceeded', 429);
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const {
      keywords = [],
      page = 1,
      perPage = 25,
      scoringProfile = 'cybersecurity'
    } = body;

    if (!Array.isArray(keywords) || keywords.length === 0) {
      return errorResponse('keywords[] is required', 400);
    }

    const profile = SCORING_PROFILES[scoringProfile] ? scoringProfile : 'cybersecurity';

    const cacheKey = getCacheKey('apollo', 'company-search', {
      keywords: keywords.join(','),
      page,
      perPage,
      profile
    });
    const cached = get(cacheKey);
    if (cached) {
      return jsonResponse(cached);
    }

    const apiKey = profile === 'commodity_trading'
      ? process.env.APOLLO_LAMINAR_API_KEY
      : process.env.APOLLO_API_KEY;

    if (!apiKey) {
      if (requireLiveDataEnabled()) {
        return errorResponse('Live company search is required but no Apollo API key is configured.', 503, {
          source: 'provider_fallback',
          provider: 'apollo_company_search',
          reason: 'REQUIRE_LIVE_DATA blocked mock company fallback.'
        });
      }
      const mockLeads = generateMockCompanies(keywords, profile);
      const result = {
        success: true,
        source: 'mock',
        profile,
        leads: mockLeads
      };
      set(cacheKey, result, 60 * 60 * 1000);
      return jsonResponse(result);
    }

    try {
      const liveLeads = await fetchApolloCompanies(apiKey, keywords, page, perPage, profile);
      if (liveLeads && liveLeads.length > 0) {
        const result = {
          success: true,
          source: 'apollo_live',
          profile,
          leads: liveLeads
        };
        set(cacheKey, result, 2 * 60 * 60 * 1000);
        return jsonResponse(result);
      }
    } catch (error) {
      console.warn('Apollo company search failed:', error.message);
    }

    if (requireLiveDataEnabled()) {
      return errorResponse('Live company search is required but Apollo returned no results.', 503, {
        source: 'provider_fallback',
        provider: 'apollo_company_search',
        reason: 'REQUIRE_LIVE_DATA blocked mock company fallback after live failure.'
      });
    }

    const mockLeads = generateMockCompanies(keywords, profile);
    const result = {
      success: true,
      source: 'apollo_fallback',
      profile,
      leads: mockLeads
    };
    set(cacheKey, result, 60 * 60 * 1000);
    return jsonResponse(result);

  } catch (error) {
    console.error('Error in apollo-company-search:', error);
    return errorResponse(error.message || 'Failed to search companies');
  }
}

async function fetchApolloCompanies(apiKey, keywords, page, perPage, profile) {
  const requestBody = {
    q_organization_keyword_tags: keywords,
    page,
    per_page: Math.min(perPage, 100)
  };

  const response = await fetchWithRetry(`${APOLLO_BASE_URL}/mixed_companies/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey
    },
    body: JSON.stringify(requestBody)
  }, 2, 10000);

  const data = await response.json();
  const orgs = data.organizations || data.accounts || [];
  if (!Array.isArray(orgs)) {
    throw new Error('Invalid response format from Apollo company search');
  }

  return orgs.map((org, idx) => transformOrganization(org, idx, profile));
}

function transformOrganization(org, idx, profile) {
  const baseScore = 40 + Math.floor(Math.random() * 20);
  const signals = [];

  const profileDef = SCORING_PROFILES[profile] || SCORING_PROFILES.cybersecurity;
  const industry = (org.industry || '').toLowerCase();
  const matchedIndustry = profileDef.industryKeywords.find(term => industry.includes(term));
  if (matchedIndustry) {
    signals.push({
      type: 'industry_match',
      scoreImpact: 15,
      details: `Industry match for "${matchedIndustry}"`
    });
  }

  const scoring = calculateScore(baseScore, signals, 5, 0);

  const segment = profile === 'commodity_trading'
    ? inferSegmentFromDomain(org.primary_domain)
    : null;

  return {
    id: `apollo_co_${org.id || idx}`,
    name: org.name || 'Unknown Company',
    industry: org.industry || 'Unknown',
    employees: org.estimated_num_employees || 0,
    revenue: org.annual_revenue
      ? `$${Math.round(org.annual_revenue / 1_000_000)}M`
      : null,
    location: [org.primary_city, org.primary_state, org.country].filter(Boolean).join(', ') || null,
    website: org.website_url || null,
    domain: org.primary_domain || null,
    leadScore: scoring.score,
    priority: scoring.priority,
    status: 'New Lead',
    signals,
    executives: [],
    news: [],
    techStack: org.technologies || [],
    securityTools: [],
    concerns: [],
    recentActivity: ['Discovered via Apollo company keyword search'],
    socialProof: {
      linkedinFollowers: org.linkedin_followers || null
    },
    financials: {
      funding: org.total_funding ? `$${Math.round(org.total_funding / 1_000_000)}M total raised` : null
    },
    explainScore: scoring.explainScore,
    profile,
    segment
  };
}

function generateMockCompanies(keywords, profile) {
  const isCommodity = profile === 'commodity_trading';
  const samplePool = isCommodity
    ? [
        { name: 'Mercuria Energy Group', industry: 'Oil & Gas Trading', city: 'Geneva', state: 'GE', country: 'CH', domain: 'mercuria.com' },
        { name: 'Vitol Holdings', industry: 'Energy Trading', city: 'Rotterdam', state: 'ZH', country: 'NL', domain: 'vitol.com' },
        { name: 'Gunvor Group', industry: 'Commodity Trading', city: 'Geneva', state: 'GE', country: 'CH', domain: 'gunvorgroup.com' },
        { name: 'Trafigura', industry: 'Commodity Trading', city: 'Singapore', state: 'SG', country: 'SG', domain: 'trafigura.com' },
        { name: 'Castleton Commodities', industry: 'Energy Trading', city: 'Stamford', state: 'CT', country: 'US', domain: 'castletoncommodities.com' }
      ]
    : [
        { name: 'TechGuard Solutions', industry: 'Software', city: 'Austin', state: 'TX', country: 'US', domain: 'techguard.example.com' },
        { name: 'SecureCorp Industries', industry: 'Healthcare', city: 'Boston', state: 'MA', country: 'US', domain: 'securecorp.example.com' },
        { name: 'DataShield Systems', industry: 'Finance', city: 'New York', state: 'NY', country: 'US', domain: 'datashield.example.com' },
        { name: 'CyberFront Technologies', industry: 'Software', city: 'San Francisco', state: 'CA', country: 'US', domain: 'cyberfront.example.com' },
        { name: 'InfoProtect Ltd', industry: 'Government', city: 'Arlington', state: 'VA', country: 'US', domain: 'infoprotect.example.com' }
      ];

  return samplePool.slice(0, 5).map((sample, idx) => transformOrganization({
    id: `mock_${idx}`,
    name: sample.name,
    industry: sample.industry,
    estimated_num_employees: 200 + Math.floor(Math.random() * 4000),
    annual_revenue: (10 + Math.floor(Math.random() * 200)) * 1_000_000,
    primary_city: sample.city,
    primary_state: sample.state,
    country: sample.country,
    website_url: `https://${sample.domain}`,
    primary_domain: sample.domain,
    technologies: isCommodity ? ['SAP', 'Murex', 'OpenLink'] : ['AWS', 'React', 'Okta'],
    linkedin_followers: 1000 + Math.floor(Math.random() * 50_000)
  }, idx, profile));
}
