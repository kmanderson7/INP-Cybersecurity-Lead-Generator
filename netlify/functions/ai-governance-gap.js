import { jsonResponse, errorResponse, fetchWithRetry, successResponse } from '../lib/http.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { get, set, getCacheKey } from '../lib/cache.js';
import { createSignal } from '../lib/normalize.js';
import { attachSignalMeta } from '../lib/source.js';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } };
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse('Method Not Allowed', 405);
  }

  const clientIP = event.headers['client-ip'] || event.headers['x-forwarded-for'] || 'anonymous';
  const rateCheck = checkRateLimit(`ai_gov_${clientIP}`, 30, 60 * 60 * 1000);

  if (!rateCheck.allowed) {
    return errorResponse('Rate limit exceeded', 429);
  }

  try {
    const { domain, company } = JSON.parse(event.body || '{}');

    if (!domain) {
      return errorResponse('Domain is required', 400);
    }

    const cacheKey = getCacheKey(domain, 'ai_governance', {});
    const cached = get(cacheKey);
    if (cached) {
      return jsonResponse(cached);
    }

    const signals = attachSignalMeta(await detectAIGovernanceGap(domain, company), {
      source: 'provider_fallback',
      provider: 'website_ai_gap_model',
      confidence: 0.48
    });
    const response = successResponse({
      signals
    }, {
      source: 'provider_fallback',
      provider: 'website_ai_gap_model',
      reason: 'AI governance gap currently uses website heuristics and not a live AI-control provider.',
      confidence: 0.48
    });

    set(cacheKey, JSON.parse(response.body), 24 * 60 * 60 * 1000);
    return response;

  } catch (error) {
    console.error('Error in ai-governance-gap:', error);
    return errorResponse('Failed to analyze AI governance', 500, {
      source: 'provider_fallback',
      provider: 'website_ai_gap_model'
    });
  }
}

async function detectAIGovernanceGap(domain, company) {
  const signals = [];

  try {
    // Check company website for AI-related content
    const aiSignals = await checkAIContent(domain);
    signals.push(...aiSignals);

    // Check for governance documentation
    const governanceSignals = await checkGovernanceContent(domain);
    signals.push(...governanceSignals);

    // Analyze the gap between AI usage and governance
    const gapAnalysis = analyzeGovernanceGap(aiSignals, governanceSignals);
    if (gapAnalysis) {
      signals.push(gapAnalysis);
    }

  } catch (error) {
    console.error('Error detecting AI governance gap:', error);
  }

  return signals;
}

async function checkAIContent(domain) {
  const signals = [];

  const aiPages = [
    '/',
    '/about',
    '/products',
    '/services',
    '/technology',
    '/ai',
    '/machine-learning',
    '/artificial-intelligence'
  ];

  const aiKeywords = [
    'artificial intelligence', 'machine learning', 'ai-powered', 'ai-driven',
    'neural network', 'deep learning', 'chatbot', 'automation',
    'predictive analytics', 'natural language processing', 'computer vision',
    'generative ai', 'gpt', 'llm', 'large language model'
  ];

  let aiMentions = 0;
  const foundPages = [];

  for (const page of aiPages) {
    try {
      const url = `https://${domain}${page}`;
      const response = await fetchWithRetry(url, {
        headers: {
          'User-Agent': process.env.USER_AGENT || 'INP2-LeadGen-Bot/1.0'
        }
      }, 1, 5000);

      if (response.ok) {
        const html = await response.text();
        const lowerHtml = html.toLowerCase();

        const pageAIMentions = aiKeywords.filter(keyword =>
          lowerHtml.includes(keyword)
        );

        if (pageAIMentions.length > 0) {
          aiMentions += pageAIMentions.length;
          foundPages.push({ page, keywords: pageAIMentions });
        }
      }
    } catch (error) {
      // Skip failed pages
      continue;
    }
  }

  if (aiMentions > 0) {
    signals.push({
      type: 'ai_usage_detected',
      mentions: aiMentions,
      pages: foundPages,
      evidence: foundPages.map(p => `https://${domain}${p.page}`)
    });
  }

  return signals;
}

async function checkGovernanceContent(domain) {
  const signals = [];

  const governancePages = [
    '/privacy',
    '/privacy-policy',
    '/data-protection',
    '/ai-ethics',
    '/responsible-ai',
    '/ai-policy',
    '/ai-governance',
    '/ethics',
    '/compliance',
    '/legal/ai',
    '/trust',
    '/security'
  ];

  const governanceKeywords = [
    'ai ethics', 'responsible ai', 'ai governance', 'ai policy',
    'algorithmic bias', 'ai transparency', 'ai accountability',
    'data ethics', 'ai safety', 'ai compliance', 'ethical ai',
    'ai oversight', 'ai risk management', 'ai audit'
  ];

  let governanceMentions = 0;
  const foundPages = [];

  for (const page of governancePages) {
    try {
      const url = `https://${domain}${page}`;
      const response = await fetchWithRetry(url, {
        headers: {
          'User-Agent': process.env.USER_AGENT || 'INP2-LeadGen-Bot/1.0'
        }
      }, 1, 5000);

      if (response.ok) {
        const html = await response.text();
        const lowerHtml = html.toLowerCase();

        const pageGovMentions = governanceKeywords.filter(keyword =>
          lowerHtml.includes(keyword)
        );

        if (pageGovMentions.length > 0) {
          governanceMentions += pageGovMentions.length;
          foundPages.push({ page, keywords: pageGovMentions });
        }
      }
    } catch (error) {
      // Skip failed pages
      continue;
    }
  }

  if (governanceMentions > 0) {
    signals.push({
      type: 'ai_governance_detected',
      mentions: governanceMentions,
      pages: foundPages,
      evidence: foundPages.map(p => `https://${domain}${p.page}`)
    });
  }

  return signals;
}

function analyzeGovernanceGap(aiSignals, governanceSignals) {
  const hasAI = aiSignals.some(s => s.type === 'ai_usage_detected');
  const hasGovernance = governanceSignals.some(s => s.type === 'ai_governance_detected');

  if (hasAI && !hasGovernance) {
    // High-impact gap: AI usage without visible governance
    return createSignal(
      'ai_gap',
      'high',
      25,
      'AI technology in use without visible governance framework',
      ['website_analysis'],
      { confidence: 0.52 }
    );
  } else if (hasAI && hasGovernance) {
    // Lower impact: AI usage with some governance
    const aiMentions = aiSignals.find(s => s.type === 'ai_usage_detected')?.mentions || 0;
    const govMentions = governanceSignals.find(s => s.type === 'ai_governance_detected')?.mentions || 0;

    if (aiMentions > govMentions * 2) {
      // AI usage significantly outpaces governance documentation
      return createSignal(
        'ai_gap',
        'medium',
        15,
        'AI usage appears to outpace governance documentation maturity',
        ['website_analysis'],
        { confidence: 0.48 }
      );
    }
  }

  return null;
}
