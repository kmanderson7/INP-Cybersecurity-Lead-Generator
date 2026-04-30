import { createHash } from 'crypto';
import { errorResponse, successResponse } from '../lib/http.js';
import { attachSignalMeta } from '../lib/source.js';

function generateCacheKey(conference, year, company) {
  return createHash('md5').update(`conf-intent:${conference}:${year}:${company || 'all'}`).digest('hex');
}

function generateConferenceData(conference, year, targetCompany = null) {
  const hash = createHash('md5').update(`${conference}${year}${targetCompany || 'global'}`).digest('hex');
  const hashNum = parseInt(hash.substring(0, 8), 16);

  const conferences = {
    Sibos: { tier: 'premier', attendeeBase: 9000, sponsorSlots: 120 },
    BAFT: { tier: 'professional', attendeeBase: 2500, sponsorSlots: 80 },
    AFP: { tier: 'premier', attendeeBase: 6500, sponsorSlots: 110 },
    CommodityTradingWeek: { tier: 'professional', attendeeBase: 1800, sponsorSlots: 55 },
    Money2020: { tier: 'premier', attendeeBase: 12000, sponsorSlots: 150 }
  };

  const confData = conferences[conference] || conferences.BAFT;
  const companies = [
    'Acme Commodities',
    'TradeFlow Capital',
    'Settlement Works',
    'Mercury Treasury',
    'NorthStar Payments',
    'Atlas Trade Finance',
    'Harbor Reconciliation',
    'BlueRiver Operations'
  ];

  if (targetCompany) {
    companies.unshift(targetCompany);
  }

  const attendees = [];
  const sponsors = [];
  const speakers = [];
  const numAttendees = Math.min((hashNum % 18) + 5, companies.length);
  const roles = [
    'CFO',
    'Head of Trade Finance',
    'Treasurer',
    'Settlement Manager',
    'Payments Lead',
    'Middle Office Director'
  ];

  for (let i = 0; i < numAttendees; i += 1) {
    const company = companies[(hashNum + i) % companies.length];
    const role = roles[(hashNum + i * 3) % roles.length];
    const isTarget = company === targetCompany;

    attendees.push({
      company,
      exec: `${isTarget ? 'Executive' : 'Delegate'} ${i + 1}`,
      role,
      isTarget
    });

    if ((hashNum + i) % 4 === 0 && sponsors.length < 8) {
      const tier = ['Gold', 'Silver', 'Bronze', 'Exhibitor'][(hashNum + i * 2) % 4];
      sponsors.push({ company, tier, isTarget });
    }

    if ((hashNum + i) % 5 === 0 && speakers.length < 5) {
      const topic = [
        'Settlement resilience',
        'Liquidity optimization',
        'Treasury transformation',
        'Payments operations',
        'Trade workflow automation'
      ][(hashNum + i * 5) % 5];
      speakers.push({
        company,
        exec: `${isTarget ? 'Executive' : 'Speaker'} ${i + 1}`,
        role,
        topic,
        isTarget
      });
    }
  }

  return {
    conference,
    year,
    tier: confData.tier,
    attendees,
    sponsors,
    speakers
  };
}

function calculateIntentScore(conferenceData) {
  const targetAttendees = conferenceData.attendees.filter((attendee) => attendee.isTarget);
  const targetSponsors = conferenceData.sponsors.filter((sponsor) => sponsor.isTarget);
  const targetSpeakers = conferenceData.speakers.filter((speaker) => speaker.isTarget);
  let intentScore = 0;

  targetSpeakers.forEach(() => { intentScore += 20; });
  targetSponsors.forEach((sponsor) => {
    intentScore += sponsor.tier === 'Gold' ? 25 : sponsor.tier === 'Silver' ? 20 : sponsor.tier === 'Bronze' ? 15 : 10;
  });
  targetAttendees.forEach((attendee) => {
    intentScore += ['CFO', 'Head of Trade Finance', 'Treasurer'].includes(attendee.role) ? 15 : 10;
  });

  if (conferenceData.tier === 'premier') intentScore *= 1.25;
  if (conferenceData.tier === 'professional') intentScore *= 1.1;

  return Math.round(Math.min(intentScore, 100));
}

function generateIntentInsights(conferenceData, intentScore) {
  const insights = [];
  const targetSponsors = conferenceData.sponsors.filter((sponsor) => sponsor.isTarget);
  const targetSpeakers = conferenceData.speakers.filter((speaker) => speaker.isTarget);
  const targetAttendees = conferenceData.attendees.filter((attendee) => attendee.isTarget);

  if (targetSpeakers.length > 0) {
    insights.push(`Speaking at ${conferenceData.conference} suggests active investment in operational transformation`);
  }

  if (targetSponsors.length > 0) {
    insights.push('Conference sponsorship indicates current budget and active market engagement');
  }

  if (targetAttendees.some((attendee) => ['CFO', 'Head of Trade Finance', 'Treasurer'].includes(attendee.role))) {
    insights.push('Senior finance attendance suggests near-term decision interest');
  }

  if (intentScore >= 50) {
    insights.push(`High event intent score (${intentScore}) suggests current buying-cycle activity`);
  }

  return insights;
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
      provider: 'conf_intent'
    });
  }

  try {
    const { conference = 'BAFT', year = new Date().getFullYear(), company } = JSON.parse(event.body || '{}');
    const cacheKey = generateCacheKey(conference, year, company);
    const conferenceData = generateConferenceData(conference, year, company);
    const intentScore = company ? calculateIntentScore(conferenceData) : 0;
    const insights = company ? generateIntentInsights(conferenceData, intentScore) : [];
    const targetEngagement = company ? {
      attendees: conferenceData.attendees.filter((attendee) => attendee.isTarget),
      sponsors: conferenceData.sponsors.filter((sponsor) => sponsor.isTarget),
      speakers: conferenceData.speakers.filter((speaker) => speaker.isTarget)
    } : null;

    const signals = company ? attachSignalMeta([{
      id: `${cacheKey}:conf`,
      type: 'conference',
      severity: intentScore >= 50 ? 'high' : intentScore >= 25 ? 'medium' : 'low',
      scoreImpact: Math.round(intentScore * 0.6),
      occurredAt: new Date().toISOString(),
      details: `${conference} ${year}: intent score ${intentScore}/100 based on ${targetEngagement.speakers.length} speakers, ${targetEngagement.sponsors.length} sponsors, ${targetEngagement.attendees.length} attendees`,
      evidence: [
        `Conference: ${conference} ${year}`,
        `Intent score: ${intentScore}/100`,
        ...insights
      ]
    }], {
      source: 'provider_fallback',
      provider: 'conference_model',
      confidence: 0.4
    }) : [];

    return successResponse({
      conference,
      year,
      company,
      attendees: conferenceData.attendees,
      sponsors: conferenceData.sponsors,
      speakers: conferenceData.speakers,
      targetEngagement,
      intentScore,
      insights,
      signals,
      metadata: {
        cacheKey,
        timestamp: new Date().toISOString(),
        ttl: 7 * 24 * 60 * 60 * 1000
      }
    }, {
      source: 'provider_fallback',
      provider: 'conference_model',
      reason: 'Conference intent is still model-driven until scraping and event-source integrations are added.',
      confidence: 0.4
    });
  } catch (error) {
    console.error('Conference intent analysis error:', error);
    return errorResponse('Failed to analyze conference intent', 500, {
      source: 'provider_fallback',
      provider: 'conf_intent'
    });
  }
}
