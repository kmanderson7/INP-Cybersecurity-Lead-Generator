import { createHash } from 'crypto';
import { errorResponse, successResponse } from '../lib/http.js';
import { attachSignalMeta } from '../lib/source.js';

function generateCacheKey(domain) {
  return createHash('md5').update(`dw-exposure:${domain}`).digest('hex');
}

function generateExposureData(domain) {
  const hash = createHash('md5').update(`exposure:${domain}`).digest('hex');
  const hashNum = parseInt(hash.substring(0, 8), 16);
  const exposureTypes = [
    'Email credentials',
    'Database records',
    'API keys',
    'Internal documents',
    'Customer data',
    'Financial information',
    'Employee records',
    'System configurations'
  ];

  const exposureLevel = hashNum % 3;
  const exposureLevels = ['low', 'medium', 'high'];
  const currentLevel = exposureLevels[exposureLevel];
  const daysAgo = (hashNum % 90) + 1;
  const lastSeen = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const numSources = (exposureLevel + 1) * ((hashNum % 3) + 1);
  const sources = [];

  for (let i = 0; i < Math.min(numSources, 6); i += 1) {
    const typeIndex = (hashNum + i * 7) % exposureTypes.length;
    const recordCount = ((hashNum + i * 11) % 1000) + 50;
    const firstSeen = new Date(Date.now() - ((daysAgo + i * 15) % 180 + 30) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    sources.push({
      type: exposureTypes[typeIndex],
      recordCount,
      firstSeen,
      severity: exposureLevel >= 1 ? 'medium' : 'low'
    });
  }

  return {
    exposureLevel: currentLevel,
    lastSeen,
    daysAgo,
    sources: sources.slice(0, 5),
    totalRecords: sources.reduce((sum, source) => sum + source.recordCount, 0)
  };
}

function calculateRiskScore(exposureData) {
  let riskScore = 0;

  if (exposureData.exposureLevel === 'high') riskScore += 35;
  else if (exposureData.exposureLevel === 'medium') riskScore += 20;
  else riskScore += 10;

  if (exposureData.daysAgo <= 30) riskScore += 10;
  else if (exposureData.daysAgo <= 60) riskScore += 5;

  const criticalSources = exposureData.sources.filter((source) =>
    source.type.includes('credentials') || source.type.includes('API keys') || source.type.includes('Financial')
  );
  riskScore += criticalSources.length * 5;

  if (exposureData.totalRecords > 1000) riskScore += 8;
  else if (exposureData.totalRecords > 500) riskScore += 5;

  return Math.min(riskScore, 50);
}

function generateRecommendations(exposureData) {
  const recommendations = [];

  if (exposureData.exposureLevel === 'high') {
    recommendations.push('Immediate credential reset and monitoring required');
    recommendations.push('Consider engaging cyber threat intelligence service');
  }

  if (exposureData.daysAgo <= 30) {
    recommendations.push('Recent exposure - review current security controls');
  }

  if (exposureData.sources.some((source) => source.type.includes('credentials') || source.type.includes('API keys'))) {
    recommendations.push('Critical credential types exposed - immediate action required');
  }

  if (exposureData.totalRecords > 500) {
    recommendations.push('Large volume exposure - consider breach notification review');
  }

  return recommendations;
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
      provider: 'dw_exposure'
    });
  }

  try {
    const { domain } = JSON.parse(event.body || '{}');
    if (!domain) {
      return errorResponse('Domain is required', 400, {
        source: 'provider_fallback',
        provider: 'dw_exposure'
      });
    }

    const cacheKey = generateCacheKey(domain);
    const exposureData = generateExposureData(domain);
    const riskScore = calculateRiskScore(exposureData);
    const recommendations = generateRecommendations(exposureData);
    const severity = exposureData.exposureLevel === 'high' ? 'high' : exposureData.exposureLevel === 'medium' ? 'medium' : 'low';

    const signals = attachSignalMeta([{
      id: `${cacheKey}:dw`,
      type: 'darkweb',
      severity,
      scoreImpact: riskScore,
      occurredAt: new Date().toISOString(),
      details: `${exposureData.exposureLevel.toUpperCase()} exposure detected: ${exposureData.sources.length} sources, ${exposureData.totalRecords} records`,
      evidence: [
        `Exposure level: ${exposureData.exposureLevel.toUpperCase()}`,
        `Last seen: ${exposureData.lastSeen} (${exposureData.daysAgo} days ago)`,
        `Sources: ${exposureData.sources.length}`,
        `Total records: ${exposureData.totalRecords}`,
        `Risk score: ${riskScore}/50`
      ]
    }], {
      source: 'provider_fallback',
      provider: 'hibp_mock',
      confidence: 0.42
    });

    return successResponse({
      domain,
      exposureLevel: exposureData.exposureLevel,
      lastSeen: exposureData.lastSeen,
      sources: exposureData.sources.map((source) => ({
        type: source.type,
        severity: source.severity,
        firstSeen: source.firstSeen
      })),
      riskScore,
      recommendations,
      signals,
      metadata: {
        cacheKey,
        timestamp: new Date().toISOString(),
        ttl: 24 * 60 * 60 * 1000,
        note: 'Safe mock implementation - no actual leaked data exposed'
      }
    }, {
      source: 'provider_fallback',
      provider: 'hibp_mock',
      reason: 'Dark web exposure remains a safe labeled mock until a live HIBP-style provider is integrated.',
      confidence: 0.42
    });
  } catch (error) {
    console.error('Dark web exposure analysis error:', error);
    return errorResponse('Failed to analyze dark web exposure', 500, {
      source: 'provider_fallback',
      provider: 'dw_exposure'
    });
  }
}
