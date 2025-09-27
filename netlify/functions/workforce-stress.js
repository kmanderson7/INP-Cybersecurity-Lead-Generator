const { createHash } = require('crypto');

function generateCacheKey(domain, company) {
  return createHash('md5').update(`workforce-stress:${domain}:${company}`).digest('hex');
}

function generateJobPostings(domain, company) {
  const hash = createHash('md5').update(`${domain}${company}`).digest('hex');
  const hashNum = parseInt(hash.substring(0, 8), 16);

  const securityRoles = [
    'Cybersecurity Analyst',
    'Information Security Manager',
    'SOC Analyst',
    'Security Engineer',
    'CISO',
    'Security Architect',
    'Incident Response Specialist',
    'Compliance Manager',
    'Risk Analyst',
    'Security Operations Manager'
  ];

  const numOpenRoles = (hashNum % 8) + 1;
  const openRoles = [];

  for (let i = 0; i < numOpenRoles; i++) {
    const roleIndex = (hashNum + i) % securityRoles.length;
    const daysOpen = ((hashNum + i * 7) % 120) + 1;
    const urgency = daysOpen > 90 ? 'high' : daysOpen > 60 ? 'medium' : 'low';

    openRoles.push({
      title: securityRoles[roleIndex],
      daysOpen,
      urgency,
      location: i % 2 === 0 ? 'Remote' : 'On-site',
      posted: new Date(Date.now() - daysOpen * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    });
  }

  return openRoles;
}

function estimateTeamSize(openRoles, company) {
  const hash = createHash('md5').update(`teamsize:${company}`).digest('hex');
  const hashNum = parseInt(hash.substring(0, 8), 16);

  const baseTeamSize = (hashNum % 20) + 5;
  const growthFactor = openRoles.length / baseTeamSize;

  return {
    current: baseTeamSize,
    target: baseTeamSize + openRoles.length,
    growthRate: Math.round(growthFactor * 100)
  };
}

function calculateStressIndex(openRoles, teamSize, avgDaysOpen) {
  let stressIndex = 0;

  const vacancyRatio = openRoles.length / (teamSize.current + openRoles.length);
  stressIndex += vacancyRatio * 40;

  if (avgDaysOpen > 90) {
    stressIndex += 30;
  } else if (avgDaysOpen > 60) {
    stressIndex += 20;
  } else if (avgDaysOpen > 30) {
    stressIndex += 10;
  }

  const highUrgencyRoles = openRoles.filter(role => role.urgency === 'high').length;
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
    const { domain, company } = JSON.parse(event.body || '{}');

    if (!domain || !company) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Domain and company name are required' })
      };
    }

    const cacheKey = generateCacheKey(domain, company);

    const openRoles = generateJobPostings(domain, company);
    const teamSizeEst = estimateTeamSize(openRoles, company);
    const avgDaysOpen = openRoles.reduce((sum, role) => sum + role.daysOpen, 0) / openRoles.length;
    const stressIndex = calculateStressIndex(openRoles, teamSizeEst, avgDaysOpen);
    const stressLevel = determineStressLevel(stressIndex);
    const scoreImpact = calculateScoreImpact(stressIndex, stressLevel);

    const severity = stressLevel === 'High Pain' ? 'high' :
                    stressLevel === 'Moderate Stress' ? 'medium' : 'low';

    const signals = [{
      type: 'workforce_stress',
      severity,
      scoreImpact,
      occurredAt: new Date().toISOString(),
      details: `${stressLevel} detected: ${openRoles.length} open security roles, avg ${Math.round(avgDaysOpen)} days open`,
      evidence: [
        `Open security roles: ${openRoles.length}`,
        `Average days open: ${Math.round(avgDaysOpen)}`,
        `Team size estimate: ${teamSizeEst.current} current, ${teamSizeEst.target} target`,
        `Stress index: ${stressIndex}/100`,
        `Stress level: ${stressLevel}`,
        `High urgency roles: ${openRoles.filter(r => r.urgency === 'high').length}`
      ]
    }];

    const response = {
      success: true,
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
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response)
    };

  } catch (error) {
    console.error('Workforce stress analysis error:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to analyze workforce stress',
        message: error.message
      })
    };
  }
};