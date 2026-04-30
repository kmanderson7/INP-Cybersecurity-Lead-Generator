import { createHash } from 'crypto';
import { attachSignalMeta } from '../lib/source.js';
import { errorResponse, successResponse } from '../lib/http.js';

function generateCacheKey(domain, company) {
  return createHash('md5').update(`board-heatmap:${domain}:${company}`).digest('hex');
}

function generateBoardTopics(domain, company) {
  const hash = createHash('md5').update(`${domain}${company}`).digest('hex');
  const hashNum = parseInt(hash.substring(0, 8), 16);
  const operationalTopics = [
    { keyword: 'Settlement Efficiency', weight: 28 },
    { keyword: 'Working Capital', weight: 26 },
    { keyword: 'Treasury Controls', weight: 24 },
    { keyword: 'Counterparty Risk', weight: 22 },
    { keyword: 'Document Flow', weight: 20 },
    { keyword: 'Middle Office Throughput', weight: 18 }
  ];

  const topics = [];
  const numTopics = (hashNum % 4) + 3;
  for (let i = 0; i < numTopics; i += 1) {
    const topicIndex = (hashNum + i * 7) % operationalTopics.length;
    const topic = operationalTopics[topicIndex];
    const count = ((hashNum + i * 11) % 8) + 1;
    const daysAgo = ((hashNum + i * 13) % 60) + 1;

    topics.push({
      keyword: topic.keyword,
      count,
      weight: topic.weight,
      lastMention: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      daysAgo,
      relevance: count * (topic.weight / 10) * (daysAgo <= 30 ? 1.5 : 1.0)
    });
  }

  return topics.sort((a, b) => b.relevance - a.relevance);
}

function calculateHeatScore(topics) {
  const total = topics.reduce((sum, topic) => sum + topic.relevance, 0);
  return Math.min(100, Math.round(total / Math.max(1, topics.length)));
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
      provider: 'board_heat_model'
    });
  }

  try {
    const { domain, company } = JSON.parse(event.body || '{}');
    if (!domain || !company) {
      return errorResponse('Domain and company name are required', 400, {
        source: 'provider_fallback',
        provider: 'board_heat_model'
      });
    }

    const cacheKey = generateCacheKey(domain, company);
    const topics = generateBoardTopics(domain, company);
    const heat = calculateHeatScore(topics);
    const heatLevel = heat >= 65 ? 'Board Priority' : heat >= 45 ? 'High Interest' : heat >= 25 ? 'Moderate Attention' : 'Background Concern';
    const severity = heat >= 65 ? 'high' : heat >= 45 ? 'medium' : 'low';
    const scoreImpact = heat >= 65 ? 30 : heat >= 45 ? 20 : 10;

    const signals = attachSignalMeta([{
      type: 'board_heat',
      severity,
      scoreImpact,
      occurredAt: new Date().toISOString(),
      details: `${heatLevel}: ${topics.length} treasury and settlement topics surfaced in strategic discussion patterns`,
      evidence: [
        `Heat score: ${heat}/100`,
        `Top topic: ${topics[0]?.keyword || 'Unknown'}`,
        `Recent mentions: ${topics.filter((topic) => topic.daysAgo <= 30).length}`
      ]
    }], {
      source: 'provider_fallback',
      provider: 'board_heat_model',
      confidence: 0.48
    });

    return successResponse({
      domain,
      company,
      topics,
      heat,
      heatLevel,
      signals,
      metadata: {
        cacheKey,
        timestamp: new Date().toISOString(),
        ttl: 24 * 60 * 60 * 1000
      }
    }, {
      source: 'provider_fallback',
      provider: 'board_heat_model',
      reason: 'Board heatmap remains modeled until SEC/earnings-call ingestion is added.',
      confidence: 0.48
    });
  } catch (error) {
    console.error('Board heatmap analysis error:', error);
    return errorResponse('Failed to analyze board topic heatmap', 500, {
      source: 'provider_fallback',
      provider: 'board_heat_model'
    });
  }
}
