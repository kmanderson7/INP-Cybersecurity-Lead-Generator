import { jsonResponse, errorResponse, fetchWithRetry } from '../lib/http.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { get, set, getCacheKey } from '../lib/cache.js';
import { scorePerson, SCORING_PROFILES } from '../lib/normalize.js';
import { qualifyTradeFinanceContacts } from '../lib/tradeFinanceContacts.js';
import { requireLiveDataEnabled } from '../lib/source.js';

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
      titles = [],
      domains = [],
      page = 1,
      perPage = 25,
      scoringProfile = 'cybersecurity'
    } = body;

    if (!Array.isArray(titles) || titles.length === 0) {
      return errorResponse('titles[] is required', 400);
    }

    const profile = SCORING_PROFILES[scoringProfile] ? scoringProfile : 'cybersecurity';

    const cacheKey = getCacheKey('apollo', 'people-search', {
      titles: titles.join(','),
      domains: (domains || []).join(','),
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
        return errorResponse('Live people data is required but no Apollo API key is configured.', 503, {
          source: 'provider_fallback',
          provider: 'apollo_people_search',
          reason: 'REQUIRE_LIVE_DATA blocked mock people fallback.'
        });
      }
      const mockPeople = generateMockPeople(titles, domains, profile);
      const result = {
        success: true,
        source: 'mock',
        profile,
        people: mockPeople
      };
      set(cacheKey, result, 60 * 60 * 1000);
      return jsonResponse(result);
    }

    try {
      const livePeople = await fetchApolloPeople(apiKey, titles, domains, page, perPage, profile);
      if (livePeople && livePeople.length > 0) {
        const result = {
          success: true,
          source: 'apollo_live',
          profile,
          people: livePeople
        };
        set(cacheKey, result, 2 * 60 * 60 * 1000);
        return jsonResponse(result);
      }
    } catch (error) {
      console.warn('Apollo people search failed:', error.message);
    }

    if (requireLiveDataEnabled()) {
      return errorResponse('Live people data is required but Apollo returned no results.', 503, {
        source: 'provider_fallback',
        provider: 'apollo_people_search',
        reason: 'REQUIRE_LIVE_DATA blocked mock people fallback after live failure.'
      });
    }

    const mockPeople = generateMockPeople(titles, domains, profile);
    const result = {
      success: true,
      source: 'apollo_fallback',
      profile,
      people: mockPeople
    };
    set(cacheKey, result, 60 * 60 * 1000);
    return jsonResponse(result);

  } catch (error) {
    console.error('Error in apollo-people-search:', error);
    return errorResponse(error.message || 'Failed to search people');
  }
}

async function fetchApolloPeople(apiKey, titles, domains, page, perPage, profile) {
  const requestBody = {
    person_titles: titles,
    page,
    per_page: Math.min(perPage, 100)
  };

  if (Array.isArray(domains) && domains.length > 0) {
    requestBody.q_organization_domains = domains;
  }

  const response = await fetchWithRetry(`${APOLLO_BASE_URL}/mixed_people/api_search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey
    },
    body: JSON.stringify(requestBody)
  }, 2, 10000);

  const data = await response.json();
  const people = data.people || [];
  if (!Array.isArray(people)) {
    throw new Error('Invalid response format from Apollo people search');
  }

  if (profile === 'commodity_trading') {
    return qualifyPeopleSearchResults(people, { source: 'apollo_live', provider: 'apollo_people_search' });
  }

  return people.map((p) => scorePerson(p, profile));
}

function generateMockPeople(titles, domains, profile) {
  const isCommodity = profile === 'commodity_trading';
  const sampleTitles = titles.slice(0, 3);
  const sampleDomains = (domains && domains.length)
    ? domains
    : (isCommodity
        ? ['mercuria.com', 'vitol.com', 'gunvorgroup.com', 'trafigura.com']
        : ['acme-health.com', 'fintrust.com', 'secureops.io', 'cloudgov.com']);

  const firstNames = ['Alex', 'Jordan', 'Morgan', 'Taylor', 'Casey', 'Riley'];
  const lastNames = ['Smith', 'Patel', 'Garcia', 'Chen', 'Johnson', 'Khan'];

  const mock = [];
  for (let i = 0; i < Math.min(8, sampleTitles.length * sampleDomains.length); i++) {
    const title = sampleTitles[i % sampleTitles.length];
    const domain = sampleDomains[i % sampleDomains.length];
    const firstName = firstNames[i % firstNames.length];
    const lastName = lastNames[i % lastNames.length];

    const rawPerson = {
      first_name: firstName,
      last_name: lastName,
      name: `${firstName} ${lastName}`,
      title,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`,
      linkedin_url: `https://linkedin.com/in/${firstName.toLowerCase()}-${lastName.toLowerCase()}-${i}`,
      organization: {
        name: domain.split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        industry: isCommodity ? 'Oil & Gas Trading' : 'Software'
      }
    };

    mock.push(profile === 'commodity_trading'
      ? rawPerson
      : scorePerson(rawPerson, profile));
  }

  if (profile === 'commodity_trading') {
    return qualifyPeopleSearchResults(mock, { source: 'mock', provider: 'apollo_people_search' });
  }

  return mock;
}

function qualifyPeopleSearchResults(people, sourceMeta) {
  const byCompany = new Map();

  for (const person of people) {
    const companyName = person.organization?.name || person.company || 'Unknown Company';
    if (!byCompany.has(companyName)) {
      byCompany.set(companyName, []);
    }
    byCompany.get(companyName).push(person);
  }

  return Array.from(byCompany.entries())
    .flatMap(([companyName, companyPeople]) => qualifyTradeFinanceContacts(companyPeople, sourceMeta, companyName))
    .map((contact) => ({
      ...contact,
      score: contact.relevanceScore,
      priority: contact.roleCategory === 'decision_maker' ? 'Critical' : contact.roleCategory === 'operator' ? 'High' : 'Medium',
      scoreReasons: [
        `Matched role category: ${contact.roleCategory.replace('_', ' ')}`,
        `Priority rank: ${contact.priorityRank}`,
        `Qualified for ${contact.company || 'target company'}`
      ]
    }));
}
