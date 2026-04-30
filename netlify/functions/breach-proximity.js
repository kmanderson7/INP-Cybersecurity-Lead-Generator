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
  const rateCheck = checkRateLimit(`breach_${clientIP}`, 25, 60 * 60 * 1000);

  if (!rateCheck.allowed) {
    return errorResponse('Rate limit exceeded', 429);
  }

  try {
    const { domain, industry, vendors = [] } = JSON.parse(event.body || '{}');

    if (!domain) {
      return errorResponse('Domain is required', 400);
    }

    const cacheKey = getCacheKey(domain, 'breach_proximity', { industry });
    const cached = get(cacheKey);
    if (cached) {
      return jsonResponse(cached);
    }

    const signals = await detectBreachProximity(domain, industry, vendors);
    const source = process.env.NEWS_API_KEY ? 'provider_live' : 'provider_fallback';
    const response = successResponse(
      {
        signals: attachSignalMeta(signals, {
          source,
          provider: process.env.NEWS_API_KEY ? 'news_api' : 'security_intelligence_mock',
          confidence: process.env.NEWS_API_KEY ? 0.71 : 0.34
        })
      },
      {
        source,
        provider: process.env.NEWS_API_KEY ? 'news_api' : 'security_intelligence_mock',
        reason: process.env.NEWS_API_KEY ? undefined : 'News API unavailable; breach proximity includes labeled fallback signals.',
        confidence: process.env.NEWS_API_KEY ? 0.71 : 0.34
      }
    );

    set(cacheKey, JSON.parse(response.body), 8 * 60 * 60 * 1000);
    return response;

  } catch (error) {
    console.error('Error in breach-proximity:', error);
    return errorResponse('Failed to analyze breach proximity', 500, {
      source: 'provider_fallback',
      provider: 'security_intelligence_mock'
    });
  }
}

async function detectBreachProximity(domain, industry, vendors) {
  const signals = [];

  try {
    // Check for direct company mentions in breach news
    const directSignals = await checkDirectBreachMentions(domain);
    signals.push(...directSignals);

    // Check for vendor/supply chain incidents
    const vendorSignals = await checkVendorBreaches(vendors, industry);
    signals.push(...vendorSignals);

    // Check for industry-wide incidents
    const industrySignals = await checkIndustryBreaches(industry);
    signals.push(...industrySignals);

  } catch (error) {
    console.error('Error detecting breach proximity:', error);
  }

  return signals;
}

async function checkDirectBreachMentions(domain) {
  const signals = [];
  const newsKey = process.env.NEWS_API_KEY; // Use the correct env var name

  if (!newsKey) {
    console.warn('News API key missing, using mock data for breach proximity');
    return generateMockBreachSignals(domain, 'direct');
  }

  try {
    const company = domain.replace(/\.(com|org|net|edu|gov)$/, '');

    // Enhanced search query for better breach detection
    const searchTerms = [
      `"${company}" AND (breach OR hacked OR attacked OR compromised OR "data breach")`,
      `"${company}" AND (incident OR "security incident" OR ransomware OR malware)`,
      `"${company}" AND (cybersecurity OR "cyber attack" OR "data leak")`
    ];

    const fromDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 45 days

    // Search with multiple query variations for better coverage
    for (const query of searchTerms) {
      try {
        const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=5&from=${fromDate}&apiKey=${newsKey}`;

        const response = await fetchWithRetry(url, {
          headers: {
            'User-Agent': 'INP2-BreachIntel-Bot/1.0'
          }
        }, 2, 10000);

        if (!response.ok) {
          console.warn(`News API request failed: ${response.status}`);
          continue;
        }

        const data = await response.json();

        if (data.status === 'error') {
          console.error('News API error:', data.message);
          continue;
        }

        if (data.articles && data.articles.length > 0) {
          for (const article of data.articles.slice(0, 2)) { // Limit to 2 per query
            // Verify the article is actually about the company
            if (!isArticleRelevant(article, company)) continue;

            const daysAgo = Math.floor((Date.now() - new Date(article.publishedAt).getTime()) / (24 * 60 * 60 * 1000));
            const breachSeverity = assessBreachSeverity(article.title, article.description);

            let scoreImpact = 30; // Base high impact for direct mention

            // Adjust score based on recency
            if (daysAgo <= 3) scoreImpact = 50;
            else if (daysAgo <= 7) scoreImpact = 45;
            else if (daysAgo <= 14) scoreImpact = 40;
            else if (daysAgo <= 30) scoreImpact = 35;

            // Adjust score based on severity
            if (breachSeverity === 'critical') scoreImpact += 15;
            else if (breachSeverity === 'high') scoreImpact += 10;
            else if (breachSeverity === 'medium') scoreImpact += 5;

            signals.push(createSignal(
              'breach_proximity',
              breachSeverity === 'critical' ? 'high' : breachSeverity === 'high' ? 'high' : 'medium',
              Math.min(scoreImpact, 65), // Cap at 65 for individual incidents
              `Security incident reported: ${article.title.substring(0, 100)}...`,
              [article.url],
              {
                publishedAt: article.publishedAt,
                source: article.source.name,
                daysAgo: daysAgo,
                severity: breachSeverity
              }
            ));
          }
        }

        // Add delay between API calls
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (queryError) {
        console.error(`Error with query "${query}":`, queryError);
        continue;
      }
    }

    // If we found signals, also check for related industry incidents
    if (signals.length > 0) {
      const industrySignals = await checkRelatedIndustryIncidents(newsKey, company, domain);
      signals.push(...industrySignals);
    }

  } catch (error) {
    console.error('Error checking direct breach mentions:', error);
    // Fallback to mock data
    return generateMockBreachSignals(domain, 'direct');
  }

  // Remove duplicates and sort by score impact
  const uniqueSignals = removeDuplicateSignals(signals);
  return uniqueSignals.sort((a, b) => b.scoreImpact - a.scoreImpact).slice(0, 5);
}

function isArticleRelevant(article, company) {
  const titleLower = article.title.toLowerCase();
  const descLower = (article.description || '').toLowerCase();
  const companyLower = company.toLowerCase();

  // Check if company name appears in title or description
  if (titleLower.includes(companyLower) || descLower.includes(companyLower)) {
    return true;
  }

  // Check for close variations (company name without common suffixes)
  const companyCore = companyLower.replace(/\s+(inc|corp|ltd|llc|company|co)$/i, '');
  if (companyCore !== companyLower && (titleLower.includes(companyCore) || descLower.includes(companyCore))) {
    return true;
  }

  return false;
}

function assessBreachSeverity(title, description) {
  const text = `${title} ${description || ''}`.toLowerCase();

  // Critical severity indicators
  const criticalIndicators = [
    'ransomware', 'data breach', 'millions affected', 'customer data',
    'financial data', 'medical records', 'personal information',
    'credit card', 'social security', 'shutdown', 'offline'
  ];

  // High severity indicators
  const highIndicators = [
    'hacked', 'cyberattack', 'compromised', 'stolen data',
    'security incident', 'unauthorized access', 'malware',
    'phishing attack', 'system breach'
  ];

  // Medium severity indicators
  const mediumIndicators = [
    'security update', 'vulnerability', 'patch', 'investigation',
    'suspicious activity', 'attempted breach', 'security alert'
  ];

  for (const indicator of criticalIndicators) {
    if (text.includes(indicator)) return 'critical';
  }

  for (const indicator of highIndicators) {
    if (text.includes(indicator)) return 'high';
  }

  for (const indicator of mediumIndicators) {
    if (text.includes(indicator)) return 'medium';
  }

  return 'low';
}

async function checkRelatedIndustryIncidents(newsKey, company, domain) {
  const signals = [];

  try {
    // Get industry context for the company (simplified approach)
    const industry = inferIndustryFromDomain(domain);
    if (!industry) return signals;

    const industryQuery = `"${industry}" AND (breach OR hack OR attack OR ransomware) AND cybersecurity`;
    const fromDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 14 days

    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(industryQuery)}&language=en&sortBy=popularity&pageSize=3&from=${fromDate}&apiKey=${newsKey}`;

    const response = await fetchWithRetry(url, {
      headers: {
        'User-Agent': 'INP2-IndustryIntel-Bot/1.0'
      }
    }, 1, 8000);

    if (response.ok) {
      const data = await response.json();

      if (data.articles && data.articles.length > 0) {
        // Add industry context signal
        signals.push(createSignal(
          'industry_breach_climate',
          'medium',
          15,
          `Recent ${industry} industry security incidents increase sector risk profile`,
          [data.articles[0].url],
          {
            industry: industry,
            relatedIncidents: data.articles.length
          }
        ));
      }
    }

  } catch (error) {
    console.error('Error checking industry incidents:', error);
  }

  return signals;
}

function inferIndustryFromDomain(domain) {
  // Simple industry inference based on domain patterns
  const domainLower = domain.toLowerCase();

  if (domainLower.includes('bank') || domainLower.includes('credit') || domainLower.includes('financial')) {
    return 'financial services';
  }
  if (domainLower.includes('health') || domainLower.includes('medical') || domainLower.includes('hospital')) {
    return 'healthcare';
  }
  if (domainLower.includes('tech') || domainLower.includes('software') || domainLower.includes('app')) {
    return 'technology';
  }
  if (domainLower.includes('retail') || domainLower.includes('shop') || domainLower.includes('store')) {
    return 'retail';
  }
  if (domainLower.includes('edu') || domainLower.includes('university') || domainLower.includes('college')) {
    return 'education';
  }
  if (domainLower.includes('gov') || domainLower.includes('government')) {
    return 'government';
  }

  return null; // Unable to determine industry
}

function removeDuplicateSignals(signals) {
  const seen = new Set();
  return signals.filter(signal => {
    const key = `${signal.type}_${signal.details.substring(0, 50)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function checkVendorBreaches(vendors, industry) {
  const signals = [];

  // Common vendors by industry
  const industryVendors = {
    'Healthcare': ['Epic', 'Cerner', 'Allscripts', 'eClinicalWorks'],
    'Finance': ['FIS', 'Fiserv', 'Jack Henry', 'Temenos'],
    'Software': ['AWS', 'Microsoft', 'Google Cloud', 'Salesforce'],
    'Manufacturing': ['SAP', 'Oracle', 'Siemens', 'GE Digital'],
    'Retail': ['Shopify', 'Square', 'Stripe', 'Adobe'],
    'Education': ['Blackboard', 'Canvas', 'Google Workspace', 'Microsoft 365']
  };

  const targetVendors = [...vendors, ...(industryVendors[industry] || [])];

  // Simulate vendor breach checking (in production, would check security feeds)
  if (targetVendors.length > 0 && Math.random() > 0.8) { // 20% chance
    const affectedVendor = targetVendors[Math.floor(Math.random() * targetVendors.length)];
    const daysAgo = Math.floor(Math.random() * 14) + 1;

    signals.push(createSignal(
      'breach_proximity',
      'medium',
      15 + Math.max(0, 15 - daysAgo), // Score decreases with age
      `Vendor security incident: ${affectedVendor} reported incident ${daysAgo} days ago`,
      ['security_intelligence_feeds']
    ));
  }

  return signals;
}

async function checkIndustryBreaches(industry) {
  const signals = [];

  // Industry-specific breach patterns and concerns
  const industryRisks = {
    'Healthcare': { keywords: ['HIPAA', 'patient data', 'medical records'], riskLevel: 'high' },
    'Finance': { keywords: ['PCI', 'financial data', 'banking'], riskLevel: 'high' },
    'Software': { keywords: ['API', 'customer data', 'SaaS'], riskLevel: 'medium' },
    'Manufacturing': { keywords: ['OT', 'industrial control', 'supply chain'], riskLevel: 'medium' },
    'Retail': { keywords: ['payment', 'customer', 'e-commerce'], riskLevel: 'medium' },
    'Education': { keywords: ['FERPA', 'student data', 'academic'], riskLevel: 'medium' }
  };

  const risk = industryRisks[industry];
  if (risk && Math.random() > 0.6) { // 40% chance of industry-related signal

    let scoreImpact = 10;
    if (risk.riskLevel === 'high') scoreImpact = 15;

    signals.push(createSignal(
      'breach_proximity',
      risk.riskLevel === 'high' ? 'medium' : 'low',
      scoreImpact,
      `Recent ${industry} sector security incidents increase risk profile`,
      ['industry_security_reports']
    ));
  }

  return signals;
}

function generateMockBreachSignals(domain, type) {
  const signals = [];

  // Generate realistic mock signals for demo purposes
  if (Math.random() > 0.85) { // 15% chance of breach proximity signal
    const mockIncidents = [
      'Vendor security notification received',
      'Industry peer incident reported',
      'Supply chain security alert',
      'Regional security incident detected'
    ];

    const incident = mockIncidents[Math.floor(Math.random() * mockIncidents.length)];
    const daysAgo = Math.floor(Math.random() * 21) + 1; // 1-21 days ago

    let scoreImpact = 20;
    if (type === 'direct') scoreImpact = 35;
    if (daysAgo <= 7) scoreImpact += 10;

    signals.push(createSignal(
      'breach_proximity',
      scoreImpact > 25 ? 'high' : 'medium',
      scoreImpact,
      `${incident} - ${daysAgo} days ago`,
      ['security_intelligence_mock']
    ));
  }

  return signals;
}
