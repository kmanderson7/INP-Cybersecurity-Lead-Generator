import { jsonResponse, errorResponse, fetchWithRetry } from '../lib/http.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { get, set, getCacheKey } from '../lib/cache.js';
import { scorePerson, SCORING_PROFILES } from '../lib/normalize.js';

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
      firstName,
      lastName,
      organizationName,
      linkedinUrl,
      email,
      scoringProfile = 'cybersecurity'
    } = body;

    if (!firstName && !lastName && !linkedinUrl && !email) {
      return errorResponse('Provide at least one of: firstName/lastName, linkedinUrl, email', 400);
    }

    const profile = SCORING_PROFILES[scoringProfile] ? scoringProfile : 'cybersecurity';

    const cacheKey = getCacheKey('apollo', 'person-enrich', {
      firstName: firstName || '',
      lastName: lastName || '',
      organizationName: organizationName || '',
      linkedinUrl: linkedinUrl || '',
      email: email || '',
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
      const mockPerson = generateMockEnrichment(body, profile);
      const result = {
        success: true,
        source: 'mock',
        profile,
        person: mockPerson
      };
      set(cacheKey, result, 60 * 60 * 1000);
      return jsonResponse(result);
    }

    try {
      const livePerson = await enrichApolloPerson(apiKey, body, profile);
      if (livePerson) {
        const result = {
          success: true,
          source: 'apollo_live',
          profile,
          person: livePerson
        };
        set(cacheKey, result, 2 * 60 * 60 * 1000);
        return jsonResponse(result);
      }
    } catch (error) {
      console.warn('Apollo person enrichment failed, falling back to mock:', error.message);
    }

    const mockPerson = generateMockEnrichment(body, profile);
    const result = {
      success: true,
      source: 'apollo_fallback',
      profile,
      person: mockPerson
    };
    set(cacheKey, result, 60 * 60 * 1000);
    return jsonResponse(result);

  } catch (error) {
    console.error('Error in apollo-person-enrich:', error);
    return errorResponse(error.message || 'Failed to enrich person');
  }
}

async function enrichApolloPerson(apiKey, input, profile) {
  const requestBody = {};
  if (input.firstName) requestBody.first_name = input.firstName;
  if (input.lastName) requestBody.last_name = input.lastName;
  if (input.organizationName) requestBody.organization_name = input.organizationName;
  if (input.linkedinUrl) requestBody.linkedin_url = input.linkedinUrl;
  if (input.email) requestBody.email = input.email;

  const response = await fetchWithRetry(`${APOLLO_BASE_URL}/people/match`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey
    },
    body: JSON.stringify(requestBody)
  }, 2, 10000);

  const data = await response.json();
  const matched = data.person || data.matched_person;
  if (!matched) {
    throw new Error('No person matched from Apollo enrichment');
  }

  return scorePerson(matched, profile);
}

function generateMockEnrichment(input, profile) {
  const firstName = input.firstName || 'Jane';
  const lastName = input.lastName || 'Doe';
  const orgName = input.organizationName
    || (input.email ? input.email.split('@')[1].split('.')[0] : 'Acme Corp');
  const isCommodity = profile === 'commodity_trading';

  const rawPerson = {
    first_name: firstName,
    last_name: lastName,
    name: `${firstName} ${lastName}`,
    title: isCommodity ? 'CFO' : 'CISO',
    email: input.email || `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${orgName.toLowerCase()}.com`,
    linkedin_url: input.linkedinUrl || `https://linkedin.com/in/${firstName.toLowerCase()}-${lastName.toLowerCase()}`,
    organization: {
      name: orgName.charAt(0).toUpperCase() + orgName.slice(1),
      industry: isCommodity ? 'Oil & Gas Trading' : 'Software'
    }
  };

  return scorePerson(rawPerson, profile);
}
