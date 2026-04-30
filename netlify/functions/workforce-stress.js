import { createHash, randomUUID } from 'crypto';
import { errorResponse, fetchWithRetry, successResponse } from '../lib/http.js';
import { attachSignalMeta, logProviderEvent, requireLiveDataEnabled } from '../lib/source.js';

const TARGET_ROLE_KEYWORDS = [
  'trade finance',
  'settlement',
  'treasury',
  'payments',
  'middle office',
  'commodity operations',
  'structured finance',
  'credit risk'
];

function generateCacheKey(domain, company) {
  return createHash('md5').update(`workforce-stress:${domain}:${company}`).digest('hex');
}

function calculateStressIndex(openRoles, teamSize, avgDaysOpen) {
  let stressIndex = 0;
  const vacancyRatio = openRoles.length / Math.max(teamSize.current + openRoles.length, 1);

  stressIndex += vacancyRatio * 40;

  if (avgDaysOpen > 90) stressIndex += 30;
  else if (avgDaysOpen > 60) stressIndex += 20;
  else if (avgDaysOpen > 30) stressIndex += 10;

  const highUrgencyRoles = openRoles.filter((role) => role.urgency === 'high').length;
  stressIndex += highUrgencyRoles * 10;

  return Math.min(Math.round(stressIndex), 100);
}

function determineStressLevel(stressIndex) {
  if (stressIndex >= 70) return 'High Pain';
  if (stressIndex >= 50) return 'Moderate Stress';
  if (stressIndex >= 30) return 'Some Pressure';
  return 'Stable';
}

function calculateScoreImpact(stressIndex, stressLevel) {
  if (stressLevel === 'High Pain') return stressIndex;
  if (stressLevel === 'Moderate Stress') return Math.round(stressIndex * 0.7);
  if (stressLevel === 'Some Pressure') return Math.round(stressIndex * 0.4);
  return Math.round(stressIndex * 0.2);
}

function estimateTeamSize(openRoles, company) {
  const hash = createHash('md5').update(`teamsize:${company}`).digest('hex');
  const hashNum = parseInt(hash.substring(0, 8), 16);
  const baseTeamSize = (hashNum % 20) + 5;
  const growthFactor = openRoles.length / Math.max(baseTeamSize, 1);

  return {
    current: baseTeamSize,
    target: baseTeamSize + openRoles.length,
    growthRate: Math.round(growthFactor * 100)
  };
}

function generateFallbackJobPostings(domain, company) {
  const hash = createHash('md5').update(`${domain}${company}`).digest('hex');
  const hashNum = parseInt(hash.substring(0, 8), 16);
  const financeRoles = [
    'Trade Finance Manager',
    'Settlement Manager',
    'Treasury Analyst',
    'Middle Office Lead',
    'Payments Operations Lead',
    'Commodity Operations Manager',
    'Structured Finance Associate',
    'Credit Risk Manager'
  ];

  const numOpenRoles = (hashNum % 8) + 1;
  const openRoles = [];

  for (let i = 0; i < numOpenRoles; i += 1) {
    const roleIndex = (hashNum + i) % financeRoles.length;
    const daysOpen = ((hashNum + i * 7) % 120) + 1;
    openRoles.push({
      title: financeRoles[roleIndex],
      daysOpen,
      urgency: daysOpen > 90 ? 'high' : daysOpen > 60 ? 'medium' : 'low',
      location: i % 2 === 0 ? 'Remote' : 'On-site',
      posted: new Date(Date.now() - daysOpen * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    });
  }

  return openRoles;
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse('Method not allowed', 405, {
      source: 'provider_fallback',
      provider: 'workforce_stress'
    });
  }

  try {
    const { domain, company } = JSON.parse(event.body || '{}');

    if (!domain || !company) {
      return errorResponse('Domain and company name are required', 400, {
        source: 'provider_fallback',
        provider: 'workforce_stress'
      });
    }

    const cacheKey = generateCacheKey(domain, company);
    const liveResult = await getLiveWorkforceStress(domain, company, cacheKey);
    if (liveResult) {
      return successResponse(liveResult.data, liveResult.meta);
    }

    if (requireLiveDataEnabled()) {
      return errorResponse('Live workforce data is required but JSearch is not configured or reachable.', 503, {
        source: 'provider_fallback',
        provider: 'jsearch',
        reason: 'REQUIRE_LIVE_DATA blocked workforce fallback.'
      });
    }

    const openRoles = generateFallbackJobPostings(domain, company);
    const teamSizeEst = estimateTeamSize(openRoles, company);
    const avgDaysOpen = openRoles.reduce((sum, role) => sum + role.daysOpen, 0) / Math.max(openRoles.length, 1);
    const stressIndex = calculateStressIndex(openRoles, teamSizeEst, avgDaysOpen);
    const stressLevel = determineStressLevel(stressIndex);
    const scoreImpact = calculateScoreImpact(stressIndex, stressLevel);
    const severity = stressLevel === 'High Pain' ? 'high' : stressLevel === 'Moderate Stress' ? 'medium' : 'low';

    const signals = attachSignalMeta([{
      id: `${cacheKey}:fallback`,
      type: 'workforce_stress',
      severity,
      scoreImpact,
      occurredAt: new Date().toISOString(),
      details: `${stressLevel} detected: ${openRoles.length} open trade finance roles, avg ${Math.round(avgDaysOpen)} days open`,
      evidence: [
        `Open operations roles: ${openRoles.length}`,
        `Average days open: ${Math.round(avgDaysOpen)}`,
        `Team size estimate: ${teamSizeEst.current} current, ${teamSizeEst.target} target`,
        `Stress index: ${stressIndex}/100`
      ]
    }], {
      source: 'provider_fallback',
      provider: 'jsearch_demo',
      confidence: 0.46
    });

    return successResponse({
      domain,
      company,
      openRoles,
      teamSizeEst,
      timeOpenAvg: Math.round(avgDaysOpen),
      stressIndex,
      stressLevel,
      signals,
      metadata: {
        cacheKey,
        timestamp: new Date().toISOString(),
        ttl: 24 * 60 * 60 * 1000
      }
    }, {
      source: 'provider_fallback',
      provider: 'jsearch_demo',
      reason: 'Used heuristic workforce stress because the live JSearch provider was unavailable.',
      confidence: 0.46
    });
  } catch (error) {
    console.error('Workforce stress analysis error:', error);
    return errorResponse('Failed to analyze workforce stress', 500, {
      source: 'provider_fallback',
      provider: 'workforce_stress'
    });
  }
}

async function getLiveWorkforceStress(domain, company, cacheKey) {
  if (!process.env.JSEARCH_RAPIDAPI_KEY) {
    return null;
  }

  const correlationId = randomUUID();
  const startedAt = Date.now();

  try {
    const query = buildRoleSearchQuery(company, domain);
    const url = `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(query)}&page=1&num_pages=1&date_posted=all`;
    const response = await fetchWithRetry(url, {
      headers: {
        'X-RapidAPI-Key': process.env.JSEARCH_RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
      }
    }, 2, 12000);

    const payload = await response.json();
    const rawJobs = Array.isArray(payload.data) ? payload.data : [];
    const openRoles = rawJobs
      .filter((job) => matchesTargetCompany(job, company, domain))
      .filter((job) => matchesTargetRole(job.job_title))
      .slice(0, 12)
      .map(mapJobPosting);

    const teamSizeEst = estimateTeamSize(openRoles, company);
    const avgDaysOpen = openRoles.length
      ? openRoles.reduce((sum, role) => sum + role.daysOpen, 0) / openRoles.length
      : 0;
    const stressIndex = calculateStressIndex(openRoles, teamSizeEst, avgDaysOpen);
    const stressLevel = determineStressLevel(stressIndex);
    const scoreImpact = calculateScoreImpact(stressIndex, stressLevel);
    const severity = stressLevel === 'High Pain' ? 'high' : stressLevel === 'Moderate Stress' ? 'medium' : 'low';

    const rawSignals = openRoles.length ? [{
      id: `${cacheKey}:live`,
      type: 'workforce_stress',
      severity,
      scoreImpact,
      occurredAt: new Date().toISOString(),
      details: `${stressLevel}: ${openRoles.length} live finance or settlement roles open, average ${Math.round(avgDaysOpen)} days active`,
      evidence: openRoles.slice(0, 4).map((role) => `${role.title} (${role.daysOpen} days open)`),
      confidence: 0.8
    }] : [];

    const signals = attachSignalMeta(rawSignals, {
      source: 'provider_live',
      provider: 'jsearch',
      confidence: openRoles.length ? 0.8 : 0.74,
      correlationId
    });

    logProviderEvent({
      functionName: 'workforce-stress',
      provider: 'jsearch',
      correlationId,
      startedAt,
      status: 'success',
      reason: `jobs=${rawJobs.length} matched=${openRoles.length}`
    });

    return {
      data: {
        domain,
        company,
        openRoles,
        teamSizeEst,
        timeOpenAvg: Math.round(avgDaysOpen),
        stressIndex,
        stressLevel,
        signals,
        metadata: {
          cacheKey,
          timestamp: new Date().toISOString(),
          ttl: 12 * 60 * 60 * 1000
        }
      },
      meta: {
        source: 'provider_live',
        provider: 'jsearch',
        reason: openRoles.length
          ? 'Live workforce stress signal built from JSearch job postings.'
          : 'Live provider returned no matching finance or settlement job postings.',
        confidence: openRoles.length ? 0.8 : 0.74,
        correlationId
      }
    };
  } catch (error) {
    logProviderEvent({
      functionName: 'workforce-stress',
      provider: 'jsearch',
      correlationId,
      startedAt,
      status: 'failure',
      reason: 'request_failed'
    });
    return null;
  }
}

function buildRoleSearchQuery(company, domain) {
  const roleQuery = TARGET_ROLE_KEYWORDS.map((term) => `"${term}"`).join(' OR ');
  return `${company} (${roleQuery})`;
}

function matchesTargetCompany(job, company, domain) {
  const employer = `${job?.employer_name || ''}`.toLowerCase();
  const normalizedCompany = company.toLowerCase();
  const normalizedDomain = domain.replace(/^www\./, '').split('.')[0].toLowerCase();

  return employer.includes(normalizedCompany) || employer.includes(normalizedDomain);
}

function matchesTargetRole(title = '') {
  const normalizedTitle = title.toLowerCase();
  return TARGET_ROLE_KEYWORDS.some((term) => normalizedTitle.includes(term));
}

function mapJobPosting(job) {
  const postedDate = extractPostedDate(job);
  const daysOpen = postedDate
    ? Math.max(1, Math.round((Date.now() - postedDate.getTime()) / (1000 * 60 * 60 * 24)))
    : 14;

  return {
    title: job.job_title,
    daysOpen,
    urgency: daysOpen > 90 ? 'high' : daysOpen > 60 ? 'medium' : 'low',
    location: [job.job_city, job.job_state, job.job_country].filter(Boolean).join(', ') || (job.job_is_remote ? 'Remote' : 'Unknown'),
    posted: postedDate ? postedDate.toISOString().split('T')[0] : null,
    department: job.job_employment_type || 'Unknown'
  };
}

function extractPostedDate(job) {
  const candidates = [
    job.job_posted_at_datetime_utc,
    job.job_posted_at_datetime_utc?.date,
    job.job_posted_at_timestamp ? new Date(Number(job.job_posted_at_timestamp) * 1000).toISOString() : null
  ].filter(Boolean);

  for (const candidate of candidates) {
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}
