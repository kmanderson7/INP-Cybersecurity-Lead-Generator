import OpenAI from 'openai';
import { jsonResponse, errorResponse } from '../lib/http.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { get, set, getCacheKey } from '../lib/cache.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
      const mockAnalysis = generateMockAnalysis(company, industry, signals);
      const result = { success: true, source: 'rule_based', analysis: mockAnalysis };
      set(cacheKey, result, 4 * 60 * 60 * 1000); // Cache for 4 hours
      return jsonResponse(result);
    }

    // AI-powered analysis
    const analysis = await analyzeWithAI(company, industry, signals, rawFindings);
    const result = { success: true, source: 'ai', analysis };

    set(cacheKey, result, 6 * 60 * 60 * 1000); // Cache for 6 hours
    return jsonResponse(result);

  } catch (error) {
    console.error('Error in aggregate-signals:', error);
    return errorResponse(error.message || 'Failed to aggregate signals');
  }
}

async function analyzeWithAI(company, industry, signals, rawFindings) {
  const prompt = buildAnalysisPrompt(company, industry, signals, rawFindings);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are a senior cybersecurity consultant and business intelligence analyst. Your job is to analyze security-related signals about companies and provide executive-level insights for cybersecurity service providers.

Your analysis must be:
- Business-focused, not technical
- Actionable for sales/business development
- Confident but not overstated
- Based on real business drivers

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

  return `Analyze this cybersecurity prospect:

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
    "decisionMakers": "Likely roles involved in security decisions"
  },
  "outreachTokens": {
    "painPoint": "primary security concern",
    "businessImpact": "revenue/compliance impact",
    "timeframe": "urgency timeframe",
    "credibilityHook": "relevant industry/company insight"
  },
  "signalPriority": [
    "List signals in order of business importance for outreach"
  ],
  "marketContext": "How this fits into broader industry trends",
  "recommendedApproach": "executive or technical approach based on signals"
}

Focus on BUSINESS IMPACT, not technical details. This analysis will be used by sales professionals.`;
}

function generateMockAnalysis(company, industry, signals) {
  const highImpactSignals = signals.filter(s => s.scoreImpact > 20);
  const urgencyScore = Math.min(95, 60 + (highImpactSignals.length * 10));

  const industryPainPoints = {
    'Healthcare': 'HIPAA compliance and patient data protection',
    'Finance': 'PCI DSS compliance and fraud prevention',
    'Software': 'API security and customer data protection',
    'Manufacturing': 'OT security and supply chain protection',
    'default': 'regulatory compliance and data protection'
  };

  const decisionCards = {
    whyNow: [
      highImpactSignals.length > 0 ? `Recent ${highImpactSignals[0].details.toLowerCase()}` : 'Increasing regulatory pressure',
      'Budget cycles typically closing soon',
      'Competitive advantage through security leadership'
    ],
    firstMoves: [
      'Executive security assessment',
      'Compliance gap analysis',
      'Risk prioritization workshop'
    ],
    risksOfWaiting: [
      'Regulatory penalties and fines',
      'Competitive security disadvantage',
      'Incident response unpreparedness'
    ]
  };

  return {
    executiveSummary: `${company} shows ${urgencyScore > 70 ? 'high' : 'moderate'} potential for cybersecurity engagement based on recent signals. ${industry} companies face increasing regulatory and competitive pressure.`,
    urgencyScore,
    confidence: highImpactSignals.length > 1 ? 'high' : 'medium',
    decisionCards,
    aiInsights: {
      primaryOpportunity: `${industryPainPoints[industry] || industryPainPoints.default} presents immediate engagement opportunity`,
      competitivePosition: 'Proactive security investment provides competitive differentiation',
      budgetIndicators: highImpactSignals.length > 0 ? 'Strong budget signals present' : 'Standard budget cycle timing',
      decisionMakers: 'CISO, CTO, and compliance leadership likely involved'
    },
    outreachTokens: {
      painPoint: industryPainPoints[industry] || industryPainPoints.default,
      businessImpact: 'operational efficiency and compliance confidence',
      timeframe: urgencyScore > 80 ? 'immediate' : 'next quarter',
      credibilityHook: `${industry} sector security trends and best practices`
    },
    signalPriority: signals.map(s => s.type),
    marketContext: `${industry} sector experiencing heightened security focus due to regulatory changes and threat evolution`,
    recommendedApproach: urgencyScore > 75 ? 'executive' : 'technical'
  };
}