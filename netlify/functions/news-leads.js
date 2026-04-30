import { errorResponse, fetchWithRetry, successResponse } from '../lib/http.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { get, set, getCacheKey } from '../lib/cache.js';
import { calculateScore } from '../lib/normalize.js';
import { attachSignalMeta, requireLiveDataEnabled } from '../lib/source.js';

export async function handler(event) {
  const newsKey = process.env.NEWS_API_KEY;
  console.log('News API key loaded:', newsKey ? '✅' : '❌ missing');

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders() };
  if (event.httpMethod !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  // Rate limiting
  const clientIP = event.headers['client-ip'] || event.headers['x-forwarded-for'] || 'anonymous';
  const rateCheck = checkRateLimit(`news_${clientIP}`, 30, 60 * 60 * 1000);

  if (!rateCheck.allowed) {
    return json({ error: 'Rate limit exceeded' }, 429);
  }

  try {
    const { industry = 'Software', keywords = ['ransomware','breach'] } = JSON.parse(event.body || '{}');

    // Check cache first
    const cacheKey = getCacheKey('news', 'leads', { industry, keywords: keywords.join(',') });
    const cached = get(cacheKey);
    if (cached) {
      return json(cached);
    }

    if (!newsKey) {
      console.warn('News API key missing, using mock data');
      if (requireLiveDataEnabled()) {
        return errorResponse('Live news lead data is required but News API is not configured.', 503, {
          source: 'mock',
          provider: 'news_api',
          reason: 'REQUIRE_LIVE_DATA blocked mock news fallback.'
        });
      }

      const mockLeads = generateMockNewsLeads(industry).map((lead) => ({
        ...lead,
        sourceMeta: {
          source: 'mock',
          provider: 'news_demo',
          live: false,
          fallbackUsed: true
        }
      }));
      const response = successResponse(
        { leads: mockLeads },
        {
          source: 'mock',
          provider: 'news_demo',
          reason: 'News API key missing; returned labeled mock news leads.',
          confidence: 0.32
        }
      );
      set(cacheKey, JSON.parse(response.body), 60 * 60 * 1000);
      return response;
    }

    // Implement actual News API call
    try {
      const newsLeads = await fetchNewsLeads(newsKey, industry, keywords);
      if (newsLeads && newsLeads.length > 0) {
        const response = successResponse(
          { leads: newsLeads },
          {
            source: 'provider_live',
            provider: 'news_api',
            confidence: 0.72
          }
        );
        set(cacheKey, JSON.parse(response.body), 30 * 60 * 1000);
        return response;
      }
    } catch (error) {
      console.warn('News API failed, falling back to mock data:', error.message);
    }

    // Fallback to mock data when API fails
    if (requireLiveDataEnabled()) {
      return errorResponse('Live news lead data is required but the provider request failed.', 503, {
        source: 'provider_live',
        provider: 'news_api',
        reason: 'REQUIRE_LIVE_DATA blocked mock news fallback after provider failure.'
      });
    }

    const mockLeads = generateMockNewsLeads(industry).map((lead) => ({
      ...lead,
      sourceMeta: {
        source: 'provider_fallback',
        provider: 'news_api',
        live: false,
        fallbackUsed: true
      }
    }));
    const response = successResponse(
      { leads: mockLeads },
      {
        source: 'provider_fallback',
        provider: 'news_api',
        reason: 'News provider failed; returned labeled mock news leads.',
        confidence: 0.28
      }
    );
    set(cacheKey, JSON.parse(response.body), 60 * 60 * 1000);
    return response;

  } catch (error) {
    console.error('Error in news-leads:', error);
    return errorResponse('Failed to fetch news leads', 500, {
      source: 'provider_fallback',
      provider: 'news_api'
    });
  }
}

// Helpers
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
function json(body, statusCode = 200) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    body: JSON.stringify(body),
  };
}

async function fetchNewsLeads(apiKey, industry, keywords) {
  const newsEndpoint = 'https://newsapi.org/v2/everything';

  // Build search query for cybersecurity-related news
  const securityKeywords = [
    ...keywords,
    'CISO hired',
    'Chief Security Officer',
    'security breach',
    'cybersecurity investment',
    'data protection',
    'compliance fine',
    'security audit',
    'ransomware attack'
  ];

  const query = securityKeywords.join(' OR ');
  const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Last 7 days

  const params = new URLSearchParams({
    q: query,
    language: 'en',
    sortBy: 'publishedAt',
    pageSize: '50',
    from: fromDate,
    apiKey: apiKey
  });

  try {
    const response = await fetchWithRetry(`${newsEndpoint}?${params}`, {
      headers: {
        'User-Agent': 'INP2-LeadGen-Bot/1.0'
      }
    }, 2, 10000);

    const data = await response.json();

    if (!data.articles || !Array.isArray(data.articles)) {
      throw new Error('Invalid response format from News API');
    }

    // Transform news articles into leads
    const newsLeads = await transformNewsToLeads(data.articles, industry);
    return newsLeads;

  } catch (error) {
    console.error('News API Error:', error);
    throw new Error(`News API failed: ${error.message}`);
  }
}

async function transformNewsToLeads(articles, targetIndustry) {
  const leads = [];
  const processedCompanies = new Set();

  for (const article of articles.slice(0, 10)) { // Limit to 10 most recent
    try {
      // Extract company names from articles using simple NLP
      const companyMatches = extractCompanyNames(article.title, article.description);

      for (const companyName of companyMatches) {
        if (processedCompanies.has(companyName.toLowerCase())) continue;
        processedCompanies.add(companyName.toLowerCase());

        // Determine why this is a valuable lead
        const leadSignals = analyzeNewsForSignals(article);

        if (leadSignals.length === 0) continue; // Skip if no relevant signals

        // Calculate lead score based on signals
        const baseScore = 50; // News-based leads start higher
        const scoring = calculateScore(baseScore, leadSignals, 10, 0); // Fresh news bonus

        const lead = {
          id: `news_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: companyName,
          industry: targetIndustry,
          employees: estimateCompanySize(companyName, article.description),
          revenue: `$${Math.floor(Math.random() * 200) + 20}M`,
          location: extractLocation(article.description) || 'Unknown',
          website: `https://${companyName.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')}.com`,
          leadScore: scoring.score,
          priority: scoring.priority,
          lastContact: null,
          status: 'New Lead',
          signals: attachSignalMeta(leadSignals, {
            source: 'provider_live',
            provider: 'news_api'
          }),
          executives: [{
            name: 'Contact Required',
            title: 'Trade Finance Decision Maker',
            email: `security@${companyName.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')}.com`
          }],
          news: [{
            date: article.publishedAt.split('T')[0],
            title: article.title,
            source: article.source.name,
            url: article.url
          }],
          techStack: ['Unknown'],
          securityTools: ['Unknown'],
          concerns: generateSecurityConcerns(article, targetIndustry),
          recentActivity: [`Featured in security news: ${article.title.substring(0, 50)}...`],
          socialProof: {
            linkedinFollowers: Math.floor(Math.random() * 50000) + 5000,
            glassdoorRating: (3.5 + Math.random() * 1.5).toFixed(1),
            trustpilotScore: (3.5 + Math.random() * 1.5).toFixed(1)
          },
          financials: {
            funding: 'Information not available',
            lastRound: 'Information not available',
            investors: 'Information not available'
          },
          explainScore: scoring.explainScore,
          sourceMeta: {
            source: 'provider_live',
            provider: 'news_api',
            live: true,
            fallbackUsed: false
          }
        };

        leads.push(lead);
      }
    } catch (error) {
      console.error('Error processing article:', error);
      continue;
    }
  }

  return leads;
}

function extractCompanyNames(title, description) {
  const text = `${title} ${description || ''}`.toLowerCase();
  const companies = [];

  // Look for company name patterns
  const companyPatterns = [
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:Inc|Corp|Corporation|Ltd|Limited|LLC|Co|Company)/gi,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:was|has been|announced|reported|suffered)/gi,
    /(?:at|by|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})(?:\s|,|\.)/gi
  ];

  for (const pattern of companyPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const companyName = match[1].trim();
      if (companyName.length > 2 && !companies.includes(companyName)) {
        companies.push(companyName);
      }
    }
  }

  return companies.slice(0, 3); // Limit to 3 companies per article
}

function analyzeNewsForSignals(article) {
  const text = `${article.title} ${article.description || ''}`.toLowerCase();
  const signals = [];

  // Security incident signals
  if (text.includes('breach') || text.includes('hack') || text.includes('attack')) {
    signals.push({
      type: 'security_incident',
      scoreImpact: 45,
      details: 'Security incident reported in news',
      evidence: [article.url]
    });
  }

  // Executive hiring signals
  if (text.includes('ciso') || text.includes('chief security') || text.includes('security officer')) {
    signals.push({
      type: 'exec_hire',
      scoreImpact: 35,
      details: 'Security executive hiring mentioned',
      evidence: [article.url]
    });
  }

  // Compliance/regulatory signals
  if (text.includes('fine') || text.includes('violation') || text.includes('compliance')) {
    signals.push({
      type: 'compliance_issue',
      scoreImpact: 30,
      details: 'Compliance or regulatory issue reported',
      evidence: [article.url]
    });
  }

  // Investment/funding signals
  if (text.includes('funding') || text.includes('investment') || text.includes('raises')) {
    signals.push({
      type: 'funding_event',
      scoreImpact: 25,
      details: 'Recent funding indicates growth and security investment',
      evidence: [article.url]
    });
  }

  // Technology adoption signals
  if (text.includes('cloud') || text.includes('digital transformation') || text.includes('ai')) {
    signals.push({
      type: 'tech_adoption',
      scoreImpact: 20,
      details: 'Technology adoption suggests security needs',
      evidence: [article.url]
    });
  }

  return signals;
}

function estimateCompanySize(companyName, description) {
  // Simple heuristics for company size estimation
  const text = (description || '').toLowerCase();

  if (text.includes('fortune 500') || text.includes('enterprise') || text.includes('multinational')) {
    return Math.floor(Math.random() * 50000) + 10000;
  }

  if (text.includes('startup') || text.includes('founded')) {
    return Math.floor(Math.random() * 500) + 10;
  }

  return Math.floor(Math.random() * 5000) + 100;
}

function extractLocation(description) {
  if (!description) return null;

  // Simple location extraction
  const locationPattern = /(?:in|at|based in)\s+([A-Z][a-z]+(?:,\s*[A-Z]{2})?)/i;
  const match = description.match(locationPattern);
  return match ? match[1] : null;
}

function generateSecurityConcerns(article, industry) {
  const text = `${article.title} ${article.description || ''}`.toLowerCase();
  const concerns = [];

  // Article-specific concerns
  if (text.includes('ransomware')) concerns.push('Ransomware protection');
  if (text.includes('phishing')) concerns.push('Email security');
  if (text.includes('cloud')) concerns.push('Cloud security posture');
  if (text.includes('compliance')) concerns.push('Regulatory compliance');
  if (text.includes('data')) concerns.push('Data protection');

  // Industry-specific fallbacks
  const industryConcerns = {
    'Healthcare': ['HIPAA compliance', 'Patient data security'],
    'Finance': ['PCI DSS compliance', 'Financial data protection'],
    'Software': ['API security', 'Customer data privacy'],
    'Manufacturing': ['OT security', 'Supply chain protection'],
    'Retail': ['Payment security', 'Customer data protection'],
    'Education': ['FERPA compliance', 'Student data protection']
  };

  if (concerns.length === 0) {
    concerns.push(...(industryConcerns[industry] || ['Cybersecurity posture', 'Data protection']));
  }

  return concerns.slice(0, 3);
}

function generateMockNewsLeads(industry) {
  return [
    {
      id: 9001,
      name: 'SecuRetail Ltd',
      industry,
      employees: 410,
      revenue: '80M',
      location: 'New York, NY',
      website: 'https://securetail.example',
      leadScore: 88,
      priority: 'Critical',
      lastContact: null,
      status: 'New Lead',
      executives: [{ name: 'Alex Rivera', title: 'Head of Trade Finance', email: 'alex@secureretail.example' }],
      news: [
        { date: '2024-07-21', title: 'Retailer hit by credential stuffing attack', source: 'Industry News' },
      ],
      techStack: ['GCP','Vue','Python'],
      securityTools: ['Microsoft Defender','Qualys','Varonis'],
      concerns: ['API security','Ransomware','Zero-trust'],
      recentActivity: ['Security audit scheduled','Hiring Security Engineer','Budget increased'],
      socialProof: { linkedinFollowers: 22000, glassdoorRating: 3.9, trustpilotScore: 4.1 },
      financials: { funding: '15M total raised', lastRound: 'Series A - 7M', investors: ['Kleiner Perkins'] },
      sourceMeta: {
        source: 'mock',
        provider: 'news_demo',
        live: false,
        fallbackUsed: true
      }
    },
  ];
}
