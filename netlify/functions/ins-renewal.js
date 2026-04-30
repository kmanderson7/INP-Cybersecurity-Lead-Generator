import { createHash } from 'crypto';
import { errorResponse, successResponse } from '../lib/http.js';
import { attachSignalMeta } from '../lib/source.js';

function generateCacheKey(domain, industry) {
  return createHash('md5').update(`ins-renewal:${domain}:${industry}`).digest('hex');
}

function estimateRenewalDate(domain, industry) {
  const hash = createHash('md5').update(`${domain}${industry}`).digest('hex');
  const hashNum = parseInt(hash.substring(0, 8), 16);
  const baseDate = new Date();
  baseDate.setMonth(baseDate.getMonth() + (hashNum % 12) + 1);
  return baseDate.toISOString().split('T')[0];
}

function identifyRequiredControls(industry) {
  const controlsByIndustry = {
    Healthcare: ['HIPAA Compliance Audit', 'BAA Management', 'PHI Encryption', 'Access Controls'],
    Finance: ['SOX Compliance', 'PCI DSS Certification', 'Data Loss Prevention', 'Multi-Factor Authentication'],
    Software: ['SOC 2 Type II', 'ISO 27001', 'GDPR Compliance', 'Vulnerability Management'],
    Manufacturing: ['NIST Framework', 'OT Security', 'Supply Chain Security', 'Incident Response Plan']
  };

  return controlsByIndustry[industry] || [
    'Basic Security Framework',
    'Endpoint Protection',
    'Network Security',
    'Security Awareness Training'
  ];
}

function calculateControlGaps(requiredControls, existingControls = []) {
  return requiredControls.filter((control) =>
    !existingControls.some((existing) => existing.toLowerCase().includes(control.toLowerCase().split(' ')[0]))
  );
}

function calculateScoreImpact(daysToRenewal, controlGaps) {
  let baseScore = 0;

  if (daysToRenewal <= 60) baseScore += 15;
  else if (daysToRenewal <= 120) baseScore += 10;
  else if (daysToRenewal <= 180) baseScore += 5;

  if (controlGaps.length > 0) {
    baseScore += Math.min(controlGaps.length * 5, 15);
  }

  return baseScore;
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
      provider: 'ins_renewal'
    });
  }

  try {
    const { domain, industry = 'Software', existingControls = [] } = JSON.parse(event.body || '{}');
    if (!domain) {
      return errorResponse('Domain is required', 400, {
        source: 'provider_fallback',
        provider: 'ins_renewal'
      });
    }

    const cacheKey = generateCacheKey(domain, industry);
    const estimatedRenewal = estimateRenewalDate(domain, industry);
    const requiredControls = identifyRequiredControls(industry);
    const controlGaps = calculateControlGaps(requiredControls, existingControls);
    const renewalDate = new Date(estimatedRenewal);
    const daysToRenewal = Math.max(0, Math.floor((renewalDate - new Date()) / (1000 * 60 * 60 * 24)));
    const scoreImpact = calculateScoreImpact(daysToRenewal, controlGaps);

    const signals = attachSignalMeta([{
      id: `${cacheKey}:ins`,
      type: 'ins_renewal',
      severity: daysToRenewal <= 60 ? 'high' : daysToRenewal <= 120 ? 'medium' : 'low',
      scoreImpact,
      occurredAt: new Date().toISOString(),
      details: `Cyber insurance renewal estimated in ${daysToRenewal} days. ${controlGaps.length} control gaps identified.`,
      evidence: [
        `Estimated renewal: ${estimatedRenewal}`,
        `Days to renewal: ${daysToRenewal}`,
        `Control gaps: ${controlGaps.join(', ') || 'None identified'}`,
        `Industry: ${industry}`
      ]
    }], {
      source: 'provider_fallback',
      provider: 'renewal_heuristic',
      confidence: 0.44
    });

    return successResponse({
      domain,
      industry,
      estimatedRenewal,
      daysToRenewal,
      requiredControls,
      controlGaps,
      signals,
      metadata: {
        cacheKey,
        timestamp: new Date().toISOString(),
        ttl: 24 * 60 * 60 * 1000
      }
    }, {
      source: 'provider_fallback',
      provider: 'renewal_heuristic',
      reason: 'Insurance renewal remains heuristic until a live policy or broker integration is added.',
      confidence: 0.44
    });
  } catch (error) {
    console.error('Insurance renewal analysis error:', error);
    return errorResponse('Failed to analyze insurance renewal status', 500, {
      source: 'provider_fallback',
      provider: 'ins_renewal'
    });
  }
}
