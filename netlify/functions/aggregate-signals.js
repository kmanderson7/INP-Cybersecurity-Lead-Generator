import OpenAI from 'openai';
import { jsonResponse, errorResponse, successResponse } from '../lib/http.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { get, set, getCacheKey } from '../lib/cache.js';
import { requireLiveDataEnabled } from '../lib/source.js';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } };
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse('Method Not Allowed', 405);
  }

  // Rate limiting for AI calls (more restrictive)
  const clientIP = event.headers['client-ip'] || event.headers['x-forwarded-for'] || 'anonymous';
  const rateCheck = checkRateLimit(`ai_${clientIP}`, 20, 60 * 60 * 1000); // 20 AI calls per hour

  if (!rateCheck.allowed) {
    return errorResponse('AI rate limit exceeded', 429);
  }

  try {
    const { domain, company, industry, signals = [], rawFindings = {} } = JSON.parse(event.body || '{}');

    if (!domain || !company) {
      return errorResponse('Domain and company name are required', 400);
    }

    // Check cache first
    const cacheKey = getCacheKey(domain, 'ai_analysis', { signals: signals.length });
    const cached = get(cacheKey);
    if (cached) {
      return jsonResponse(cached);
    }

    const aiKey = process.env.OPENAI_API_KEY;
    if (!aiKey) {
      console.warn('OpenAI API key missing, using rule-based analysis');
      if (requireLiveDataEnabled()) {
        return errorResponse('Live AI analysis is required but OpenAI is not configured.', 503, {
          source: 'provider_fallback',
          provider: 'openai',
          reason: 'REQUIRE_LIVE_DATA blocked rule-based fallback analysis.'
        });
      }

      const mockAnalysis = generateMockAnalysis(company, industry, signals);
      const response = successResponse(
        { analysis: mockAnalysis },
        {
          source: 'provider_fallback',
          provider: 'rule_engine',
          reason: 'OpenAI API key missing; returned labeled rule-based analysis.',
          confidence: 0.38
        }
      );
      set(cacheKey, JSON.parse(response.body), 4 * 60 * 60 * 1000);
      return response;
    }

    // AI-powered analysis
    const analysis = await analyzeWithAI(company, industry, signals, rawFindings);
    const response = successResponse(
      { analysis },
      {
        source: 'ai_synthesized',
        provider: 'openai',
        confidence: analysis?.confidence === 'high' ? 0.82 : analysis?.confidence === 'medium' ? 0.65 : 0.52
      }
    );

    set(cacheKey, JSON.parse(response.body), 6 * 60 * 60 * 1000);
    return response;

  } catch (error) {
    console.error('Error in aggregate-signals:', error);
    return errorResponse('Failed to aggregate signals', 500, {
      source: 'ai_synthesized',
      provider: 'openai'
    });
  }
}

async function analyzeWithAI(company, industry, signals, rawFindings) {
  const prompt = buildAnalysisPrompt(company, industry, signals, rawFindings);
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are a senior go-to-market analyst for Laminar Digital. Your job is to analyze trade finance, treasury, settlement, and operations signals about companies and provide executive-level insights for outreach.

Your analysis must be:
- Business-focused, not technical
- Actionable for sales/business development
- Confident but not overstated
- Based on real business drivers
- Written for finance and operations decision-makers

Always respond with valid JSON matching the exact schema requested.`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 1500
    });

    const content = completion.choices[0].message.content;
    return JSON.parse(content);

  } catch (error) {
    console.error('OpenAI API error:', error);
    // Fallback to rule-based analysis
    return generateMockAnalysis(company, industry, signals);
  }
}

function buildAnalysisPrompt(company, industry, signals, rawFindings) {
  const signalSummary = signals.map(s =>
    `- ${s.type}: ${s.details} (Impact: ${s.scoreImpact}, Severity: ${s.severity})`
  ).join('\n');

  return `Analyze this trade-finance and settlement prospect:

COMPANY: ${company}
INDUSTRY: ${industry}
SIGNALS DETECTED:
${signalSummary}

RAW INTELLIGENCE: ${JSON.stringify(rawFindings, null, 2)}

Provide a comprehensive business analysis in this EXACT JSON format:

{
  "executiveSummary": "2-sentence executive summary of opportunity",
  "urgencyScore": 85,
  "confidence": "high",
  "decisionCards": {
    "whyNow": ["Business reason 1", "Business reason 2", "Business reason 3"],
    "firstMoves": ["Recommended action 1", "Recommended action 2", "Recommended action 3"],
    "risksOfWaiting": ["Risk 1", "Risk 2", "Risk 3"]
  },
  "aiInsights": {
    "primaryOpportunity": "Main business opportunity in one sentence",
    "competitivePosition": "How urgency affects their market position",
    "budgetIndicators": "Signals about budget availability/pressure",
    "decisionMakers": "Likely roles involved in the decision"
  },
  "outreachTokens": {
    "persona_context": "relevant role framing for CFO or trade finance leader",
    "settlement_risk": "where settlements or exceptions may break down",
    "liquidity_impact": "working-capital or liquidity effect",
    "process_friction": "workflow or reconciliation friction",
    "counterparty_risk": "counterparty or document risk",
    "timeframe": "urgency timeframe",
    "credibilityHook": "relevant industry/company insight"
  },
  "signalPriority": [
    "List signals in order of business importance for outreach"
  ],
  "marketContext": "How this fits into broader industry trends",
  "recommendedApproach": "executive or technical approach based on signals"
}

Focus on BUSINESS IMPACT, not technical details. De-prioritize cyber-only framing unless it clearly affects financial operations. This analysis will be used by sales professionals.`;
}

function generateMockAnalysis(company, industry, signals) {
  const highImpactSignals = signals.filter(s => s.scoreImpact > 20);
  const urgencyScore = Math.min(95, 60 + (highImpactSignals.length * 10));

  const industryPainPoints = {
    'Healthcare': 'document-heavy approvals and delayed settlement visibility',
    'Finance': 'liquidity drag, exceptions, and reconciliation delays',
    'Software': 'payments complexity and fragmented approval workflows',
    'Manufacturing': 'commodity settlement coordination and counterparty friction',
    'default': 'manual workflow friction and weak settlement visibility'
  };

  const decisionCards = {
    whyNow: [
      highImpactSignals.length > 0 ? `Recent ${highImpactSignals[0].details.toLowerCase()}` : 'Increasing regulatory pressure',
      'Budget cycles typically closing soon',
      'Pressure to improve operating control without adding more headcount'
    ],
    firstMoves: [
      'Review settlement exceptions and timing leakage',
      'Map approval bottlenecks across treasury and operations',
      'Prioritize one workflow with measurable liquidity impact'
    ],
    risksOfWaiting: [
      'More manual work and delayed settlements',
      'Working-capital drag remains hidden',
      'Counterparty friction compounds across teams'
    ]
  };

  return {
    executiveSummary: `${company} shows ${urgencyScore > 70 ? 'high' : 'moderate'} potential for trade-finance and settlement improvement based on recent signals. ${industry} teams are under pressure to reduce friction while improving control.`,
    urgencyScore,
    confidence: highImpactSignals.length > 1 ? 'high' : 'medium',
    decisionCards,
    aiInsights: {
      primaryOpportunity: `${industryPainPoints[industry] || industryPainPoints.default} presents an immediate workflow-improvement opportunity`,
      competitivePosition: 'Faster, cleaner settlement execution improves resilience and capital efficiency',
      budgetIndicators: highImpactSignals.length > 0 ? 'Signals suggest current pressure to fund operational improvements' : 'Budget timing is plausible but not yet explicit',
      decisionMakers: 'CFO, head of trade finance, treasury, and settlement operations leadership are likely involved'
    },
    outreachTokens: {
      persona_context: 'Framed for a finance or operations leader responsible for timing, liquidity, and control',
      settlement_risk: 'reconciliation and settlement exceptions create avoidable exposure',
      liquidity_impact: 'manual delays can tie up working capital and slow decision-making',
      process_friction: industryPainPoints[industry] || industryPainPoints.default,
      counterparty_risk: 'handoff gaps increase document, timing, and counterparty risk',
      timeframe: urgencyScore > 80 ? 'immediate' : 'next quarter',
      credibilityHook: `${industry} peers are under pressure to reduce manual exceptions and improve settlement timing`
    },
    signalPriority: signals.map(s => s.type),
    marketContext: `${industry} sector is under pressure to improve visibility, control, and speed across finance operations`,
    recommendedApproach: urgencyScore > 75 ? 'executive' : 'operator'
  };
}
