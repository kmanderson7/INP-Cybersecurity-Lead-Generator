const { createHash } = require('crypto');

function generateCacheKey(domain, industry) {
  return createHash('md5').update(`ins-renewal:${domain}:${industry}`).digest('hex');
}

function estimateRenewalDate(domain, industry) {
  const hash = createHash('md5').update(`${domain}${industry}`).digest('hex');
  const hashNum = parseInt(hash.substring(0, 8), 16);

  const baseDate = new Date();
  const monthsOffset = (hashNum % 12) + 1;
  baseDate.setMonth(baseDate.getMonth() + monthsOffset);

  return baseDate.toISOString().split('T')[0];
}

function identifyRequiredControls(industry) {
  const controlsByIndustry = {
    'Healthcare': [
      'HIPAA Compliance Audit',
      'BAA Management',
      'PHI Encryption',
      'Access Controls'
    ],
    'Finance': [
      'SOX Compliance',
      'PCI DSS Certification',
      'Data Loss Prevention',
      'Multi-Factor Authentication'
    ],
    'Software': [
      'SOC 2 Type II',
      'ISO 27001',
      'GDPR Compliance',
      'Vulnerability Management'
    ],
    'Manufacturing': [
      'NIST Framework',
      'OT Security',
      'Supply Chain Security',
      'Incident Response Plan'
    ]
  };

  return controlsByIndustry[industry] || [
    'Basic Security Framework',
    'Endpoint Protection',
    'Network Security',
    'Security Awareness Training'
  ];
}

function calculateControlGaps(requiredControls, existingControls = []) {
  const gaps = requiredControls.filter(control =>
    !existingControls.some(existing =>
      existing.toLowerCase().includes(control.toLowerCase().split(' ')[0])
    )
  );

  return gaps;
}

function calculateScoreImpact(daysToRenewal, controlGaps) {
  let baseScore = 0;

  if (daysToRenewal <= 60) {
    baseScore += 15;
  } else if (daysToRenewal <= 120) {
    baseScore += 10;
  } else if (daysToRenewal <= 180) {
    baseScore += 5;
  }

  if (controlGaps.length > 0) {
    baseScore += Math.min(controlGaps.length * 5, 15);
  }

  return baseScore;
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
    const { domain, industry = 'Software', existingControls = [] } = JSON.parse(event.body || '{}');

    if (!domain) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Domain is required' })
      };
    }

    const cacheKey = generateCacheKey(domain, industry);

    const estimatedRenewal = estimateRenewalDate(domain, industry);
    const requiredControls = identifyRequiredControls(industry);
    const controlGaps = calculateControlGaps(requiredControls, existingControls);

    const renewalDate = new Date(estimatedRenewal);
    const now = new Date();
    const daysToRenewal = Math.max(0, Math.floor((renewalDate - now) / (1000 * 60 * 60 * 24)));

    const scoreImpact = calculateScoreImpact(daysToRenewal, controlGaps);

    const confidence = controlGaps.length === 0 ? 'high' :
                      controlGaps.length <= 2 ? 'medium' : 'low';

    const signals = [{
      type: 'ins_renewal',
      severity: daysToRenewal <= 60 ? 'high' : daysToRenewal <= 120 ? 'medium' : 'low',
      scoreImpact,
      occurredAt: new Date().toISOString(),
      details: `Cyber insurance renewal estimated in ${daysToRenewal} days. ${controlGaps.length} control gaps identified.`,
      evidence: [
        `Estimated renewal: ${estimatedRenewal}`,
        `Days to renewal: ${daysToRenewal}`,
        `Control gaps: ${controlGaps.join(', ') || 'None identified'}`,
        `Required controls: ${requiredControls.length}`,
        `Industry: ${industry}`
      ]
    }];

    const response = {
      success: true,
      domain,
      industry,
      estimatedRenewal,
      daysToRenewal,
      requiredControls,
      controlGaps,
      confidence,
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
    console.error('Insurance renewal analysis error:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to analyze insurance renewal status',
        message: error.message
      })
    };
  }
};