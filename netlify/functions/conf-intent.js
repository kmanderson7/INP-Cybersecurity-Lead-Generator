const { createHash } = require('crypto');

function generateCacheKey(conference, year, company) {
  return createHash('md5').update(`conf-intent:${conference}:${year}:${company || 'all'}`).digest('hex');
}

function generateConferenceData(conference, year, targetCompany = null) {
  const hash = createHash('md5').update(`${conference}${year}${targetCompany || 'global'}`).digest('hex');
  const hashNum = parseInt(hash.substring(0, 8), 16);

  const conferences = {
    'RSA': { tier: 'premier', attendeeBase: 45000, sponsorSlots: 150 },
    'Black Hat': { tier: 'premier', attendeeBase: 20000, sponsorSlots: 80 },
    'DEF CON': { tier: 'community', attendeeBase: 30000, sponsorSlots: 40 },
    'BSides': { tier: 'regional', attendeeBase: 1500, sponsorSlots: 25 },
    'SANS': { tier: 'training', attendeeBase: 8000, sponsorSlots: 60 },
    'ISC2 Security Congress': { tier: 'professional', attendeeBase: 4000, sponsorSlots: 50 }
  };

  const confData = conferences[conference] || conferences['BSides'];

  const companies = [
    'Acme Corp', 'TechFlow Inc', 'DataSafe LLC', 'CloudFirst Corp', 'SecureNet Inc',
    'InnovateIT', 'CyberGuard Pro', 'DataFlow Systems', 'TechShield Inc', 'SafeCloud Corp'
  ];

  if (targetCompany) {
    companies.unshift(targetCompany);
  }

  const attendees = [];
  const sponsors = [];
  const speakers = [];

  const numAttendees = Math.min((hashNum % 20) + 5, companies.length);

  for (let i = 0; i < numAttendees; i++) {
    const companyIndex = (hashNum + i) % companies.length;
    const company = companies[companyIndex];

    const roles = ['CISO', 'Security Director', 'IT Manager', 'CTO', 'Security Analyst', 'Compliance Manager'];
    const roleIndex = (hashNum + i * 3) % roles.length;

    const isTarget = company === targetCompany;

    attendees.push({
      company,
      exec: `${isTarget ? 'Executive' : 'Professional'} ${i + 1}`,
      role: roles[roleIndex],
      isTarget
    });

    if ((hashNum + i) % 4 === 0 && sponsors.length < 8) {
      const tiers = ['Gold', 'Silver', 'Bronze', 'Exhibitor'];
      const tierIndex = (hashNum + i * 2) % tiers.length;

      sponsors.push({
        company,
        tier: tiers[tierIndex],
        isTarget
      });
    }

    if ((hashNum + i) % 6 === 0 && speakers.length < 5) {
      const topics = [
        'Zero Trust Architecture',
        'Cloud Security Strategy',
        'Incident Response',
        'AI in Cybersecurity',
        'Compliance Automation'
      ];
      const topicIndex = (hashNum + i * 5) % topics.length;

      speakers.push({
        company,
        exec: `${isTarget ? 'Executive' : 'Professional'} ${i + 1}`,
        role: roles[roleIndex],
        topic: topics[topicIndex],
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
    speakers,
    totalAttendees: attendees.length,
    totalSponsors: sponsors.length,
    totalSpeakers: speakers.length
  };
}

function calculateIntentScore(conferenceData, targetCompany) {
  let intentScore = 0;

  const targetAttendees = conferenceData.attendees.filter(a => a.isTarget);
  const targetSponsors = conferenceData.sponsors.filter(s => s.isTarget);
  const targetSpeakers = conferenceData.speakers.filter(s => s.isTarget);

  targetSpeakers.forEach(speaker => {
    intentScore += 20;
  });

  targetSponsors.forEach(sponsor => {
    switch (sponsor.tier) {
      case 'Gold':
        intentScore += 25;
        break;
      case 'Silver':
        intentScore += 20;
        break;
      case 'Bronze':
        intentScore += 15;
        break;
      default:
        intentScore += 10;
    }
  });

  targetAttendees.forEach(attendee => {
    if (['CISO', 'CTO', 'Security Director'].includes(attendee.role)) {
      intentScore += 15;
    } else {
      intentScore += 10;
    }
  });

  switch (conferenceData.tier) {
    case 'premier':
      intentScore *= 1.3;
      break;
    case 'professional':
      intentScore *= 1.1;
      break;
    case 'training':
      intentScore *= 1.2;
      break;
  }

  return Math.round(Math.min(intentScore, 100));
}

function generateIntentInsights(conferenceData, targetCompany, intentScore) {
  const insights = [];

  const targetSponsors = conferenceData.sponsors.filter(s => s.isTarget);
  const targetSpeakers = conferenceData.speakers.filter(s => s.isTarget);
  const targetAttendees = conferenceData.attendees.filter(a => a.isTarget);

  if (targetSpeakers.length > 0) {
    insights.push(`Speaking at ${conferenceData.conference} indicates thought leadership investment`);
  }

  if (targetSponsors.length > 0) {
    const topTier = targetSponsors.find(s => s.tier === 'Gold');
    if (topTier) {
      insights.push(`Gold sponsorship shows significant security initiative budget`);
    } else {
      insights.push(`Conference sponsorship indicates active security community engagement`);
    }
  }

  if (targetAttendees.length > 0) {
    const executives = targetAttendees.filter(a => ['CISO', 'CTO', 'Security Director'].includes(a.role));
    if (executives.length > 0) {
      insights.push(`Executive attendance suggests strategic security planning`);
    }
  }

  if (intentScore >= 50) {
    insights.push(`High intent score (${intentScore}) indicates active security investment cycle`);
  }

  return insights;
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { conference = 'RSA', year = new Date().getFullYear(), company } = JSON.parse(event.body || '{}');

    const cacheKey = generateCacheKey(conference, year, company);

    const conferenceData = generateConferenceData(conference, year, company);
    const intentScore = company ? calculateIntentScore(conferenceData, company) : 0;
    const insights = company ? generateIntentInsights(conferenceData, company, intentScore) : [];

    const targetEngagement = company ? {
      attendees: conferenceData.attendees.filter(a => a.isTarget),
      sponsors: conferenceData.sponsors.filter(s => s.isTarget),
      speakers: conferenceData.speakers.filter(s => s.isTarget)
    } : null;

    const severity = intentScore >= 50 ? 'high' : intentScore >= 25 ? 'medium' : 'low';
    const scoreImpact = company ? intentScore * 0.6 : 0;

    const signals = company ? [{
      type: 'conference',
      severity,
      scoreImpact: Math.round(scoreImpact),
      occurredAt: new Date().toISOString(),
      details: `${conference} ${year}: Intent score ${intentScore}/100 based on ${targetEngagement.speakers.length} speakers, ${targetEngagement.sponsors.length} sponsors, ${targetEngagement.attendees.length} attendees`,
      evidence: [
        `Conference: ${conference} ${year}`,
        `Intent score: ${intentScore}/100`,
        `Speakers: ${targetEngagement.speakers.length}`,
        `Sponsors: ${targetEngagement.sponsors.length}`,
        `Attendees: ${targetEngagement.attendees.length}`,
        ...insights
      ]
    }] : [];

    const response = {
      success: true,
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
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response)
    };

  } catch (error) {
    console.error('Conference intent analysis error:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to analyze conference intent',
        message: error.message
      })
    };
  }
};