import { jsonResponse, errorResponse } from '../lib/http.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { get, set, getCacheKey } from '../lib/cache.js';
import { calculateScore, createSignal } from '../lib/normalize.js';
import OpenAI from 'openai';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } };
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse('Method Not Allowed', 405);
  }

  const clientIP = event.headers['client-ip'] || event.headers['x-forwarded-for'] || 'anonymous';
  const rateCheck = checkRateLimit(`ai_analysis_${clientIP}`, 30, 60 * 60 * 1000); // 30 requests per hour

  if (!rateCheck.allowed) {
    return errorResponse('Rate limit exceeded', 429);
  }

  try {
    const { content, analysisType, context = {} } = JSON.parse(event.body || '{}');

    if (!content) {
      return errorResponse('Content is required for analysis', 400);
    }

    const cacheKey = getCacheKey('ai_analysis', analysisType, {
      content: content.substring(0, 100), // Cache key based on content snippet
      context: JSON.stringify(context)
    });
    const cached = get(cacheKey);
    if (cached) {
      return jsonResponse(cached);
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      console.warn('OpenAI API key missing, using fallback analysis');
      const fallbackAnalysis = generateFallbackAnalysis(content, analysisType, context);
      const result = { success: true, source: 'fallback_ai', analysis: fallbackAnalysis };
      set(cacheKey, result, 2 * 60 * 60 * 1000); // Cache for 2 hours
      return jsonResponse(result);
    }

    const analysis = await performAIAnalysis(openaiKey, content, analysisType, context);
    const result = { success: true, source: 'openai', analysis };

    set(cacheKey, result, 4 * 60 * 60 * 1000); // Cache for 4 hours
    return jsonResponse(result);

  } catch (error) {
    console.error('Error in ai-content-analysis:', error);
    return errorResponse(error.message || 'Failed to analyze content');
  }
}

async function performAIAnalysis(apiKey, content, analysisType, context) {
  const openai = new OpenAI({ apiKey });

  const analysisPrompts = {
    'security_relevance': createSecurityRelevancePrompt(content, context),
    'lead_qualification': createLeadQualificationPrompt(content, context),
    'urgency_assessment': createUrgencyAssessmentPrompt(content, context),
    'competitive_intelligence': createCompetitiveIntelPrompt(content, context),
    'sentiment_analysis': createSentimentAnalysisPrompt(content, context),
    'entity_extraction': createEntityExtractionPrompt(content, context)
  };

  const prompt = analysisPrompts[analysisType] || analysisPrompts['security_relevance'];

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert cybersecurity sales intelligence analyst. Provide accurate, actionable insights for B2B lead generation in the cybersecurity industry.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 1000,
      temperature: 0.3, // Lower temperature for more consistent analysis
      response_format: { type: 'json_object' }
    });

    const analysis = JSON.parse(completion.choices[0].message.content);
    return enhanceAnalysisWithSignals(analysis, analysisType, content);

  } catch (error) {
    console.error('OpenAI API error:', error);
    // Fallback to rule-based analysis
    return generateFallbackAnalysis(content, analysisType, context);
  }
}

function createSecurityRelevancePrompt(content, context) {
  return `
Analyze the following content for cybersecurity sales relevance. Return a JSON response with this structure:

{
  "relevance_score": 0-100,
  "security_indicators": ["indicator1", "indicator2"],
  "buying_signals": ["signal1", "signal2"],
  "pain_points": ["pain1", "pain2"],
  "decision_timeline": "immediate|short|medium|long",
  "company_size_indicators": "startup|smb|mid-market|enterprise",
  "budget_indicators": "low|medium|high|enterprise",
  "key_quotes": ["quote1", "quote2"],
  "recommended_approach": "strategy for engagement",
  "confidence_level": 0-100
}

Content to analyze:
${content}

Context: ${JSON.stringify(context)}

Focus on identifying:
1. Security challenges or incidents mentioned
2. Technology investments or changes
3. Compliance requirements or deadlines
4. Executive mentions or hiring
5. Growth indicators that suggest security needs
6. Competitive threats or market pressures
7. Budget or investment discussions
`;
}

function createLeadQualificationPrompt(content, context) {
  return `
Evaluate this lead based on the content provided. Return a JSON response:

{
  "qualification_score": 0-100,
  "bant_analysis": {
    "budget": "qualified|unqualified|unknown",
    "authority": "qualified|unqualified|unknown",
    "need": "qualified|unqualified|unknown",
    "timing": "qualified|unqualified|unknown"
  },
  "ideal_customer_match": 0-100,
  "engagement_readiness": "hot|warm|cold",
  "recommended_messaging": "personalized message approach",
  "next_best_action": "immediate action to take",
  "competitive_threats": ["threat1", "threat2"],
  "objection_anticipation": ["objection1", "objection2"]
}

Content: ${content}
Context: ${JSON.stringify(context)}
`;
}

function createUrgencyAssessmentPrompt(content, context) {
  return `
Assess the urgency level of this cybersecurity opportunity. Return JSON:

{
  "urgency_score": 0-100,
  "urgency_drivers": ["driver1", "driver2"],
  "timeline_indicators": "immediate|weeks|months|next_year",
  "catalyst_events": ["event1", "event2"],
  "risk_factors": ["risk1", "risk2"],
  "window_of_opportunity": "narrow|moderate|wide|unclear",
  "competitive_urgency": "high|medium|low",
  "recommended_cadence": "daily|weekly|monthly"
}

Content: ${content}
Context: ${JSON.stringify(context)}
`;
}

function createCompetitiveIntelPrompt(content, context) {
  return `
Extract competitive intelligence from this content. Return JSON:

{
  "mentioned_vendors": ["vendor1", "vendor2"],
  "technology_preferences": ["tech1", "tech2"],
  "vendor_satisfaction": "high|medium|low|mixed",
  "switching_indicators": ["indicator1", "indicator2"],
  "evaluation_criteria": ["criteria1", "criteria2"],
  "decision_process": "described process",
  "influencers": ["person1", "person2"],
  "competitive_advantages": ["advantage1", "advantage2"],
  "market_positioning": "description"
}

Content: ${content}
Context: ${JSON.stringify(context)}
`;
}

function createSentimentAnalysisPrompt(content, context) {
  return `
Analyze sentiment and emotional indicators. Return JSON:

{
  "overall_sentiment": "positive|negative|neutral|mixed",
  "confidence_level": 0-100,
  "emotional_indicators": ["frustration", "optimism", "urgency"],
  "satisfaction_level": "high|medium|low|unclear",
  "stress_indicators": ["indicator1", "indicator2"],
  "enthusiasm_level": "high|medium|low",
  "resistance_factors": ["factor1", "factor2"],
  "receptivity_score": 0-100
}

Content: ${content}
Context: ${JSON.stringify(context)}
`;
}

function createEntityExtractionPrompt(content, context) {
  return `
Extract key entities and structured data. Return JSON:

{
  "companies": ["company1", "company2"],
  "people": [{"name": "Name", "title": "Title", "email": "email"}],
  "technologies": ["tech1", "tech2"],
  "locations": ["location1", "location2"],
  "dates": ["2024-01-01"],
  "monetary_amounts": ["$1M", "$500K"],
  "compliance_frameworks": ["SOC 2", "ISO 27001"],
  "security_tools": ["tool1", "tool2"],
  "business_metrics": {"employees": 500, "revenue": "50M"},
  "contact_information": {"phones": [], "emails": [], "websites": []}
}

Content: ${content}
Context: ${JSON.stringify(context)}
`;
}

function enhanceAnalysisWithSignals(analysis, analysisType, content) {
  const signals = [];

  switch (analysisType) {
    case 'security_relevance':
      if (analysis.relevance_score >= 80) {
        signals.push(createSignal(
          'high_security_relevance',
          'high',
          25,
          'AI analysis indicates high cybersecurity relevance',
          ['ai_analysis']
        ));
      }
      break;

    case 'lead_qualification':
      if (analysis.qualification_score >= 75) {
        signals.push(createSignal(
          'qualified_lead',
          'high',
          30,
          'AI analysis confirms lead qualification',
          ['ai_analysis']
        ));
      }
      break;

    case 'urgency_assessment':
      if (analysis.urgency_score >= 70) {
        signals.push(createSignal(
          'urgent_opportunity',
          'high',
          20,
          'AI analysis indicates urgent timeline',
          ['ai_analysis']
        ));
      }
      break;
  }

  return {
    ...analysis,
    ai_signals: signals,
    analysis_timestamp: new Date().toISOString(),
    content_length: content.length,
    analysis_type: analysisType
  };
}

function generateFallbackAnalysis(content, analysisType, context) {
  // Rule-based fallback when OpenAI is unavailable
  const contentLower = content.toLowerCase();

  switch (analysisType) {
    case 'security_relevance':
      return generateSecurityRelevanceFallback(contentLower, context);

    case 'lead_qualification':
      return generateLeadQualificationFallback(contentLower, context);

    case 'urgency_assessment':
      return generateUrgencyAssessmentFallback(contentLower, context);

    default:
      return generateSecurityRelevanceFallback(contentLower, context);
  }
}

function generateSecurityRelevanceFallback(contentLower, context) {
  let relevanceScore = 0;
  const securityIndicators = [];
  const buyingSignals = [];
  const painPoints = [];

  // Security keywords analysis
  const securityKeywords = [
    'cybersecurity', 'security', 'breach', 'attack', 'vulnerability',
    'compliance', 'audit', 'risk', 'threat', 'incident',
    'firewall', 'siem', 'endpoint', 'identity', 'access'
  ];

  const urgencyKeywords = [
    'urgent', 'immediate', 'asap', 'crisis', 'emergency',
    'deadline', 'critical', 'priority', 'quickly'
  ];

  const budgetKeywords = [
    'budget', 'investment', 'funding', 'purchase', 'buy',
    'evaluate', 'proposal', 'quote', 'pricing'
  ];

  // Calculate relevance score
  securityKeywords.forEach(keyword => {
    if (contentLower.includes(keyword)) {
      relevanceScore += 10;
      securityIndicators.push(keyword);
    }
  });

  urgencyKeywords.forEach(keyword => {
    if (contentLower.includes(keyword)) {
      relevanceScore += 15;
      buyingSignals.push(`Urgency indicator: ${keyword}`);
    }
  });

  budgetKeywords.forEach(keyword => {
    if (contentLower.includes(keyword)) {
      relevanceScore += 12;
      buyingSignals.push(`Budget indicator: ${keyword}`);
    }
  });

  // Pain point detection
  if (contentLower.includes('problem') || contentLower.includes('issue') || contentLower.includes('challenge')) {
    painPoints.push('Stated problems or challenges');
    relevanceScore += 8;
  }

  if (contentLower.includes('improve') || contentLower.includes('enhance') || contentLower.includes('upgrade')) {
    painPoints.push('Improvement initiatives');
    relevanceScore += 6;
  }

  // Cap the score at 100
  relevanceScore = Math.min(relevanceScore, 100);

  return {
    relevance_score: relevanceScore,
    security_indicators: securityIndicators.slice(0, 5),
    buying_signals: buyingSignals.slice(0, 3),
    pain_points: painPoints.slice(0, 3),
    decision_timeline: relevanceScore >= 70 ? 'short' : relevanceScore >= 40 ? 'medium' : 'long',
    company_size_indicators: estimateCompanySize(contentLower),
    budget_indicators: estimateBudgetLevel(contentLower, relevanceScore),
    key_quotes: extractKeyQuotes(content),
    recommended_approach: generateRecommendedApproach(relevanceScore, securityIndicators),
    confidence_level: Math.min(relevanceScore + 20, 85), // Fallback confidence is lower
    ai_signals: [],
    analysis_timestamp: new Date().toISOString(),
    source: 'rule_based_fallback'
  };
}

function generateLeadQualificationFallback(contentLower, context) {
  let qualificationScore = 50; // Start neutral

  // BANT Analysis
  const budget = contentLower.includes('budget') || contentLower.includes('funding') ? 'qualified' : 'unknown';
  const authority = contentLower.includes('ceo') || contentLower.includes('cto') || contentLower.includes('ciso') ? 'qualified' : 'unknown';
  const need = contentLower.includes('security') || contentLower.includes('compliance') ? 'qualified' : 'unqualified';
  const timing = contentLower.includes('urgent') || contentLower.includes('immediate') ? 'qualified' : 'unknown';

  // Adjust score based on BANT
  if (budget === 'qualified') qualificationScore += 15;
  if (authority === 'qualified') qualificationScore += 20;
  if (need === 'qualified') qualificationScore += 25;
  if (timing === 'qualified') qualificationScore += 20;

  return {
    qualification_score: Math.min(qualificationScore, 100),
    bant_analysis: { budget, authority, need, timing },
    ideal_customer_match: qualificationScore,
    engagement_readiness: qualificationScore >= 75 ? 'hot' : qualificationScore >= 50 ? 'warm' : 'cold',
    recommended_messaging: 'Security-focused value proposition',
    next_best_action: qualificationScore >= 75 ? 'Schedule demo' : 'Send information',
    competitive_threats: ['Unknown competitors'],
    objection_anticipation: ['Budget concerns', 'Timeline constraints'],
    source: 'rule_based_fallback'
  };
}

function generateUrgencyAssessmentFallback(contentLower, context) {
  let urgencyScore = 30; // Start low
  const urgencyDrivers = [];

  // Urgency indicators
  if (contentLower.includes('breach') || contentLower.includes('attack')) {
    urgencyScore += 40;
    urgencyDrivers.push('Security incident');
  }

  if (contentLower.includes('deadline') || contentLower.includes('compliance')) {
    urgencyScore += 25;
    urgencyDrivers.push('Compliance deadline');
  }

  if (contentLower.includes('budget') && contentLower.includes('end')) {
    urgencyScore += 20;
    urgencyDrivers.push('Budget cycle timing');
  }

  return {
    urgency_score: Math.min(urgencyScore, 100),
    urgency_drivers: urgencyDrivers,
    timeline_indicators: urgencyScore >= 70 ? 'immediate' : urgencyScore >= 50 ? 'weeks' : 'months',
    catalyst_events: urgencyDrivers,
    risk_factors: ['Delayed decision impact'],
    window_of_opportunity: urgencyScore >= 70 ? 'narrow' : 'moderate',
    competitive_urgency: urgencyScore >= 60 ? 'high' : 'medium',
    recommended_cadence: urgencyScore >= 70 ? 'daily' : 'weekly',
    source: 'rule_based_fallback'
  };
}

function estimateCompanySize(contentLower) {
  if (contentLower.includes('enterprise') || contentLower.includes('fortune')) {
    return 'enterprise';
  } else if (contentLower.includes('startup') || contentLower.includes('small')) {
    return 'startup';
  } else if (contentLower.includes('mid') || contentLower.includes('growing')) {
    return 'mid-market';
  }
  return 'smb';
}

function estimateBudgetLevel(contentLower, relevanceScore) {
  if (contentLower.includes('million') || contentLower.includes('enterprise') || relevanceScore >= 80) {
    return 'enterprise';
  } else if (contentLower.includes('thousand') || contentLower.includes('budget') || relevanceScore >= 60) {
    return 'high';
  } else if (relevanceScore >= 40) {
    return 'medium';
  }
  return 'low';
}

function extractKeyQuotes(content) {
  // Simple quote extraction - look for quoted text
  const quotes = content.match(/"([^"]+)"/g) || [];
  return quotes.slice(0, 3).map(quote => quote.replace(/"/g, ''));
}

function generateRecommendedApproach(relevanceScore, indicators) {
  if (relevanceScore >= 80) {
    return 'Direct executive outreach with security-focused value proposition';
  } else if (relevanceScore >= 60) {
    return 'Educational approach highlighting relevant security challenges';
  } else if (relevanceScore >= 40) {
    return 'Thought leadership content and gradual relationship building';
  }
  return 'General security awareness and industry insights sharing';
}