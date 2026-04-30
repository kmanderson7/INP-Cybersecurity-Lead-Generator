import { randomUUID } from 'crypto';
import { jsonResponse, errorResponse, fetchWithRetry, successResponse } from '../lib/http.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { get, set, getCacheKey } from '../lib/cache.js';
import { calculateScore, createSignal, getPriority } from '../lib/normalize.js';
import {
  attachSignalMeta,
  getApolloProviderConfig,
  logProviderEvent,
  requireLiveDataEnabled
} from '../lib/source.js';
import {
  qualifyTradeFinanceContacts,
  isTradeFinanceRelevantTitle,
  TRADE_FINANCE_TITLE_INCLUDE_KEYWORDS
} from '../lib/tradeFinanceContacts.js';

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

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
      provider: 'fetch_leads',
      source: 'mock'
    });
  }

  const clientIP = event.headers['client-ip'] || event.headers['x-forwarded-for'] || 'anonymous';
  const rateCheck = checkRateLimit(clientIP, 50, 60 * 60 * 1000);
  if (!rateCheck.allowed) {
    return errorResponse('Rate limit exceeded', 429, {
      provider: 'fetch_leads',
      source: 'mock'
    });
  }

  const providerConfig = getApolloProviderConfig();
  const correlationId = randomUUID();
  const requestStartedAt = Date.now();

  try {
    const {
      industry = 'Finance',
      minEmployees = 50,
      maxEmployees = 1000
    } = JSON.parse(event.body || '{}');

    const cacheKey = getCacheKey('apollo', 'trade-finance-leads', {
      industry,
      minEmployees,
      maxEmployees,
      providerMode: providerConfig.mode
    });
    const cached = get(cacheKey);
    if (cached) {
      return jsonResponse(cached);
    }

    if (!providerConfig.apiKey) {
      if (requireLiveDataEnabled()) {
        return errorResponse('Live Apollo lead data is required but Apollo is not configured.', 503, {
          provider: 'apollo_unconfigured',
          source: 'mock',
          correlationId,
          reason: 'REQUIRE_LIVE_DATA blocked mock fallback because Apollo credentials are missing.'
        });
      }

      const mockLeads = generateMockLeads(industry, minEmployees, maxEmployees, {
        source: 'mock',
        provider: 'mock_catalog',
        correlationId
      });
      const result = {
        success: true,
        data: { leads: mockLeads },
        meta: {
          source: 'mock',
          provider: 'mock_catalog',
          live: false,
          fallbackUsed: true,
          reason: 'Apollo credentials missing; returned labeled mock lead dataset.',
          fetchedAt: new Date().toISOString(),
          correlationId,
          confidence: 0.35
        }
      };

      set(cacheKey, result, 60 * 60 * 1000);
      return jsonResponse(result);
    }

    try {
      const leads = await fetchApolloLeadDataset(
        providerConfig.apiKey,
        industry,
        minEmployees,
        maxEmployees,
        {
          source: providerConfig.source,
          provider: providerConfig.provider,
          correlationId
        }
      );

      logProviderEvent({
        functionName: 'fetch-leads',
        provider: providerConfig.provider,
        correlationId,
        startedAt: requestStartedAt,
        status: 'success'
      });

      const response = successResponse(
        { leads },
        {
          source: providerConfig.source,
          provider: providerConfig.provider,
          correlationId,
          live: true,
          fallbackUsed: providerConfig.mode === 'legacy',
          reason: providerConfig.mode === 'legacy'
            ? 'APOLLO_LAMINAR_API_KEY missing; used legacy Apollo provider.'
            : undefined,
          confidence: 0.84
        }
      );

      set(cacheKey, JSON.parse(response.body), 2 * 60 * 60 * 1000);
      return response;
    } catch (providerError) {
      logProviderEvent({
        functionName: 'fetch-leads',
        provider: providerConfig.provider,
        correlationId,
        startedAt: requestStartedAt,
        status: 'failure',
        reason: providerError.message
      });

      if (requireLiveDataEnabled()) {
        return errorResponse('Live Apollo lead data is required but the provider request failed.', 503, {
          provider: providerConfig.provider,
          source: providerConfig.source,
          correlationId,
          reason: 'REQUIRE_LIVE_DATA blocked fallback after Apollo request failure.'
        });
      }

      const mockLeads = generateMockLeads(industry, minEmployees, maxEmployees, {
        source: 'apollo_fallback',
        provider: providerConfig.provider,
        correlationId
      });

      const result = {
        success: true,
        data: { leads: mockLeads },
        meta: {
          source: 'apollo_fallback',
          provider: providerConfig.provider,
          live: false,
          fallbackUsed: true,
          reason: 'Apollo request failed; returned labeled mock dataset.',
          fetchedAt: new Date().toISOString(),
          correlationId,
          confidence: 0.3
        }
      };

      set(cacheKey, result, 60 * 60 * 1000);
      return jsonResponse(result);
    }
  } catch (error) {
    console.error('Error in fetch-leads:', error);
    return errorResponse('Failed to fetch leads', 500, {
      provider: providerConfig.provider,
      source: providerConfig.source,
      correlationId,
      reason: 'Unhandled server error while building lead response.'
    });
  }
}

async function fetchApolloLeadDataset(apiKey, industry, minEmployees, maxEmployees, sourceMeta) {
  const organizations = await fetchApolloOrganizations(apiKey, industry, minEmployees, maxEmployees);

  if (!organizations.length) {
    throw new Error('Apollo organization search returned no matching accounts');
  }

  const domains = organizations
    .map((org) => org.primary_domain || extractDomain(org.website_url || ''))
    .filter(Boolean)
    .slice(0, 25);

  const people = domains.length
    ? await fetchApolloPeople(apiKey, domains)
    : [];

  const peopleByOrg = groupPeopleByOrganization(people);

  return organizations.slice(0, 10).map((org, index) =>
    transformApolloLead(org, peopleByOrg, industry, index, sourceMeta)
  );
}

async function fetchApolloOrganizations(apiKey, industry, minEmployees, maxEmployees) {
  const requestBody = {
    q_organization_keyword_tags: [industry],
    organization_num_employees_ranges: [`${minEmployees},${maxEmployees}`],
    page: 1,
    per_page: 15
  };

  const response = await fetchWithRetry(`${APOLLO_BASE_URL}/mixed_companies/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey
    },
    body: JSON.stringify(requestBody)
  }, 2, 12000);

  const payload = await response.json();
  const organizations = payload.organizations || payload.accounts || [];

  if (!Array.isArray(organizations)) {
    throw new Error('Invalid organization response from Apollo');
  }

  return organizations;
}

async function fetchApolloPeople(apiKey, domains) {
  const requestBody = {
    person_titles: TRADE_FINANCE_TITLE_INCLUDE_KEYWORDS,
    q_organization_domains: domains,
    page: 1,
    per_page: 50
  };

  const response = await fetchWithRetry(`${APOLLO_BASE_URL}/mixed_people/api_search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey
    },
    body: JSON.stringify(requestBody)
  }, 2, 12000);

  const payload = await response.json();
  const people = Array.isArray(payload.people) ? payload.people : [];

  return people.filter((person) => isTradeFinanceRelevantTitle(person.title));
}

function transformApolloLead(org, peopleByOrg, targetIndustry, index, sourceMeta) {
  const domain = org.primary_domain || extractDomain(org.website_url || '');
  const companyName = org.name || 'Unknown Company';
  const contacts = qualifyTradeFinanceContacts(
    peopleByOrg.get(org.id) || peopleByOrg.get(domain) || [],
    sourceMeta,
    companyName
  );

  const leadSignals = attachSignalMeta(
    buildFirmographicSignals(org, contacts),
    sourceMeta
  );

  const baseScore = calculateBaseScore(org, contacts);
  const scoring = calculateScore(baseScore, leadSignals, 5, 0);

  const website = org.website_url || (domain ? `https://${domain}` : null);
  const location = [org.primary_city, org.primary_state, org.country].filter(Boolean).join(', ') || null;

  const lead = {
    id: `apollo_${org.id || index}`,
    name: org.name || 'Unknown Company',
    domain,
    industry: org.industry || targetIndustry,
    employees: org.estimated_num_employees || 0,
    revenue: formatRevenue(org.annual_revenue),
    location,
    website,
    leadScore: scoring.score,
    priority: scoring.priority,
    lastContact: null,
    status: 'New Lead',
    signals: leadSignals,
    contacts,
    executives: contacts,
    news: [],
    techStack: org.technologies || [],
    securityTools: [],
    concerns: [
      'Settlement cycle friction',
      'Liquidity pressure',
      'Counterparty operational risk'
    ],
    recentActivity: [
      'Apollo organization intelligence refreshed',
        contacts.length ? `Identified ${contacts.length} qualified trade finance contacts` : 'No qualified trade finance contacts identified yet'
    ],
    socialProof: {
      linkedinFollowers: org.linkedin_followers || null
    },
    financials: {
      funding: org.total_funding ? `$${Math.round(org.total_funding / 1_000_000)}M total raised` : null,
      lastRound: null,
      investors: null
    },
    explainScore: scoring.explainScore,
    sourceMeta
  };

  return lead;
}

function buildFirmographicSignals(org, contacts) {
  const signals = [];
  const domain = org.primary_domain || extractDomain(org.website_url || '') || org.name || 'organization';
  const evidence = [`Apollo organization profile: ${domain}`];

  if (org.estimated_num_employees >= 250) {
    signals.push(createSignal(
      'firmographic_fit',
      'medium',
      10,
      `${org.estimated_num_employees} employees suggests operational complexity across treasury and settlement teams`,
      evidence
    ));
  }

  if (contacts.length > 0) {
    const topContact = contacts[0];
    signals.push(createSignal(
      'buyer_contact',
      topContact.roleCategory === 'decision_maker' ? 'high' : 'medium',
      Math.min(25, Math.round(topContact.relevanceScore / 4)),
      `Identified ${contacts.length} relevant trade finance contacts led by ${topContact.title}`,
      evidence,
      { confidence: 0.82 }
    ));
  }

  if (org.annual_revenue) {
    signals.push(createSignal(
      'firmographic_fit',
      'low',
      8,
      `Apollo firmographics report annual revenue of ${formatRevenue(org.annual_revenue)}`,
      evidence,
      { confidence: 0.72 }
    ));
  }

  return signals;
}

function calculateBaseScore(org, contacts) {
  let score = 42;

  const employees = org.estimated_num_employees || 0;
  if (employees >= 5000) score += 15;
  else if (employees >= 1000) score += 12;
  else if (employees >= 250) score += 8;
  else if (employees >= 100) score += 5;

  const industry = `${org.industry || ''}`.toLowerCase();
  if (industry.includes('finance') || industry.includes('bank') || industry.includes('trading')) {
    score += 12;
  }

  if (contacts.length > 0) {
    score += Math.min(18, Math.round(contacts[0].relevanceScore / 6));
  }

  return Math.min(score, 80);
}

function groupPeopleByOrganization(people) {
  const map = new Map();

  for (const person of people) {
    const org = person.organization || {};
    const keys = [org.id, org.primary_domain, extractDomain(org.website_url || '')].filter(Boolean);

    for (const key of keys) {
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(person);
    }
  }

  return map;
}

function generateMockLeads(industry, minEmployees, maxEmployees, sourceMeta) {
  const companies = [
    {
      name: 'Mercator Settlement Partners',
      industry: 'Trade Finance',
      location: 'Houston, TX',
      domain: 'mercatorsettlement.example',
      contacts: [
        { name: 'Avery Patel', title: 'Head of Trade Finance', seniority: 'head', department: 'Trade Finance' },
        { name: 'Morgan Lee', title: 'Settlement Manager', seniority: 'manager', department: 'Operations' }
      ]
    },
    {
      name: 'BlueHarbor Treasury Services',
      industry: 'Treasury Operations',
      location: 'Chicago, IL',
      domain: 'blueharbortreasury.example',
      contacts: [
        { name: 'Jordan Smith', title: 'Treasurer', seniority: 'vp', department: 'Treasury' },
        { name: 'Casey Chen', title: 'Middle Office Lead', seniority: 'manager', department: 'Operations' }
      ]
    },
    {
      name: 'CrossCurrent Commodities',
      industry: 'Commodity Trading',
      location: 'Stamford, CT',
      domain: 'crosscurrentcommodities.example',
      contacts: [
        { name: 'Riley Garcia', title: 'CFO', seniority: 'c_suite', department: 'Finance' },
        { name: 'Alex Khan', title: 'Commodity Operations Manager', seniority: 'manager', department: 'Operations' }
      ]
    },
    {
      name: 'NorthBridge Payments & Trade',
      industry: 'Payments',
      location: 'New York, NY',
      domain: 'northbridgepayments.example',
      contacts: [
        { name: 'Taylor Johnson', title: 'Head of Payments', seniority: 'head', department: 'Payments' },
        { name: 'Jamie Brooks', title: 'Structured Finance Lead', seniority: 'director', department: 'Structured Finance' }
      ]
    },
    {
      name: 'Atlas Middle Office Group',
      industry: 'Trade Operations',
      location: 'Denver, CO',
      domain: 'atlasmiddleoffice.example',
      contacts: [
        { name: 'Cameron Diaz', title: 'Director of Trade Finance', seniority: 'director', department: 'Trade Finance' },
        { name: 'Drew Nelson', title: 'Settlement Operations Lead', seniority: 'manager', department: 'Operations' }
      ]
    }
  ];

  return companies.slice(0, 5).map((company, index) => {
    const employees = Math.max(
      minEmployees,
      Math.min(maxEmployees, minEmployees + 150 + (index * 180))
    );
    const contacts = qualifyTradeFinanceContacts(company.contacts, sourceMeta, company.name);

    const signals = attachSignalMeta([
      createSignal(
        'firmographic_fit',
        'medium',
        9,
        `${employees} employees across treasury and trade operations`,
        [company.domain],
        { confidence: 0.55 }
      ),
      createSignal(
        'buyer_contact',
        contacts[0]?.roleCategory === 'decision_maker' ? 'high' : 'medium',
        Math.min(24, Math.round((contacts[0]?.relevanceScore || 60) / 4)),
        `Mock contact set includes ${contacts[0]?.title || 'finance contact'} for outreach testing`,
        [company.domain],
        { confidence: 0.48 }
      )
    ], sourceMeta);

    const scoring = calculateScore(55, signals, 2, 0);

    return {
      id: `mock_${index + 1}`,
      name: company.name,
      domain: company.domain,
      industry: company.industry || industry,
      employees,
      revenue: `$${25 + index * 15}M`,
      location: company.location,
      website: `https://${company.domain}`,
      leadScore: scoring.score,
      priority: getPriority(scoring.score),
      lastContact: null,
      status: 'New Lead',
      signals,
      contacts,
      executives: contacts,
      news: [],
      techStack: ['Murex', 'SAP', 'Power BI'],
      securityTools: [],
      concerns: ['Settlement exceptions', 'Liquidity visibility', 'Manual reconciliation'],
      recentActivity: ['Mock dataset loaded for demo continuity'],
      socialProof: {
        linkedinFollowers: 1500 + index * 850
      },
      financials: {
        funding: null,
        lastRound: null,
        investors: null
      },
      explainScore: scoring.explainScore,
      sourceMeta
    };
  });
}

function formatRevenue(revenue) {
  if (!revenue) {
    return null;
  }

  return `$${Math.round(revenue / 1_000_000)}M`;
}

function extractDomain(url) {
  if (!url) {
    return '';
  }

  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return String(url).replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
}
