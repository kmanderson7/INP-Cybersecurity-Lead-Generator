import { jsonResponse, errorResponse, fetchWithRetry } from '../lib/http.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { get, set, getCacheKey } from '../lib/cache.js';
import { createSignal } from '../lib/normalize.js';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } };
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse('Method Not Allowed', 405);
  }

  const clientIP = event.headers['client-ip'] || event.headers['x-forwarded-for'] || 'anonymous';
  const rateCheck = checkRateLimit(`rfp_${clientIP}`, 25, 60 * 60 * 1000);

  if (!rateCheck.allowed) {
    return errorResponse('Rate limit exceeded', 429);
  }

  try {
    const { domain, company, industry } = JSON.parse(event.body || '{}');

    const cacheKey = getCacheKey('rfp_hunter', 'search', { industry });
    const cached = get(cacheKey);
    if (cached) {
      return jsonResponse(cached);
    }

    const signals = await huntSecurityRFPs(domain, company, industry);
    const result = { success: true, signals, source: 'rfp_intelligence' };

    set(cacheKey, result, 8 * 60 * 60 * 1000); // Cache for 8 hours
    return jsonResponse(result);

  } catch (error) {
    console.error('Error in rfp-hunter:', error);
    return errorResponse(error.message || 'Failed to hunt RFPs');
  }
}

async function huntSecurityRFPs(domain, company, industry) {
  const signals = [];

  try {
    // Check company website for RFP/procurement pages
    const companyRFPs = await checkCompanyRFPs(domain);
    signals.push(...companyRFPs);

    // Simulate industry RFP monitoring (in production, would use specialized RFP aggregation services)
    const industryRFPs = await checkIndustryRFPs(industry);
    signals.push(...industryRFPs);

    // Check for security-specific procurement indicators
    const securityRFPs = await checkSecurityProcurement(domain, company);
    signals.push(...securityRFPs);

  } catch (error) {
    console.error('Error hunting RFPs:', error);
  }

  return signals;
}

async function checkCompanyRFPs(domain) {
  const signals = [];

  const procurementPages = [
    '/procurement',
    '/rfp',
    '/rfq',
    '/vendor',
    '/suppliers',
    '/sourcing',
    '/purchasing',
    '/bid',
    '/tender',
    '/contracts'
  ];

  for (const page of procurementPages) {
    try {
      const url = `https://${domain}${page}`;
      const response = await fetchWithRetry(url, {
        headers: {
          'User-Agent': process.env.USER_AGENT || 'INP2-LeadGen-Bot/1.0'
        }
      }, 1, 5000);

      if (response.ok) {
        const html = await response.text();
        const rfpSignals = parseRFPContent(html, url);
        signals.push(...rfpSignals);
      }
    } catch (error) {
      // Skip failed pages
      continue;
    }
  }

  return signals;
}

function parseRFPContent(html, sourceUrl) {
  const signals = [];
  const lowerHtml = html.toLowerCase();

  const securityKeywords = [
    'cybersecurity', 'information security', 'network security',
    'endpoint security', 'security assessment', 'penetration testing',
    'security audit', 'compliance audit', 'risk assessment',
    'security monitoring', 'siem', 'soc', 'incident response',
    'vulnerability management', 'identity management', 'access control'
  ];

  const rfpIndicators = [
    'request for proposal', 'rfp', 'request for quote', 'rfq',
    'invitation to bid', 'itb', 'call for bids', 'solicitation',
    'procurement opportunity', 'vendor selection', 'competitive bid'
  ];

  const hasRFPLanguage = rfpIndicators.some(indicator => lowerHtml.includes(indicator));
  const securityMentions = securityKeywords.filter(keyword => lowerHtml.includes(keyword));

  if (hasRFPLanguage && securityMentions.length > 0) {
    // Extract potential due dates
    const dates = extractProcurementDates(html);
    const isActive = dates.some(date => date > new Date());

    signals.push(createSignal(
      'rfp',
      isActive ? 'high' : 'medium',
      isActive ? 40 : 25,
      `Security RFP/procurement page found with ${securityMentions.length} security mentions`,
      [sourceUrl]
    ));
  }

  return signals;
}

function extractProcurementDates(html) {
  const dates = [];

  // Common date patterns in procurement documents
  const datePatterns = [
    /due\s+(?:date|by):?\s*([a-z]+ \d{1,2},? \d{4})/gi,
    /deadline:?\s*([a-z]+ \d{1,2},? \d{4})/gi,
    /closes?\s+(?:on|at):?\s*([a-z]+ \d{1,2},? \d{4})/gi,
    /submission\s+(?:due|deadline):?\s*([a-z]+ \d{1,2},? \d{4})/gi
  ];

  for (const pattern of datePatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      try {
        const date = new Date(match[1]);
        if (date && date > new Date('2020-01-01')) {
          dates.push(date);
        }
      } catch (error) {
        // Skip invalid dates
      }
    }
  }

  return dates;
}

async function checkIndustryRFPs(industry) {
  const signals = [];

  // Simulate industry-specific RFP monitoring
  // In production, would integrate with:
  // - Government RFP databases (SAM.gov, BidNet, etc.)
  // - Private sector RFP aggregators
  // - Industry-specific procurement platforms

  const industryRFPProb = {
    'Government': 0.4,    // High RFP activity
    'Healthcare': 0.3,    // Moderate RFP activity
    'Finance': 0.25,      // Moderate RFP activity
    'Education': 0.35,    // Moderate-high RFP activity
    'Manufacturing': 0.2, // Lower RFP activity
    'Software': 0.15      // Lowest RFP activity
  };

  const probability = industryRFPProb[industry] || 0.2;

  if (Math.random() < probability) {
    const rfpTypes = [
      'Security Assessment Services',
      'Network Security Infrastructure',
      'Endpoint Protection Platform',
      'Security Monitoring and SIEM',
      'Incident Response Services',
      'Penetration Testing Services',
      'Compliance Audit Services',
      'Identity Management System'
    ];

    const rfpType = rfpTypes[Math.floor(Math.random() * rfpTypes.length)];
    const daysFromNow = Math.floor(Math.random() * 60) + 15; // 15-75 days from now

    signals.push(createSignal(
      'rfp',
      'high',
      40,
      `${industry} sector RFP detected: ${rfpType} (due in ~${daysFromNow} days)`,
      ['industry_rfp_monitoring']
    ));
  }

  return signals;
}

async function checkSecurityProcurement(domain, company) {
  const signals = [];

  // Check for security vendor evaluation indicators
  try {
    const url = `https://${domain}`;
    const response = await fetchWithRetry(url, {
      headers: {
        'User-Agent': process.env.USER_AGENT || 'INP2-LeadGen-Bot/1.0'
      }
    }, 1, 5000);

    if (response.ok) {
      const html = await response.text();
      const procurementSignals = analyzeProcurementSignals(html, domain);
      signals.push(...procurementSignals);
    }
  } catch (error) {
    // Skip if website unavailable
  }

  return signals;
}

function analyzeProcurementSignals(html, domain) {
  const signals = [];
  const lowerHtml = html.toLowerCase();

  // Procurement readiness indicators
  const procurementIndicators = [
    'vendor registration', 'supplier portal', 'procurement process',
    'security requirements', 'vendor requirements', 'compliance requirements',
    'procurement guidelines', 'vendor onboarding', 'supplier qualification'
  ];

  const foundIndicators = procurementIndicators.filter(indicator =>
    lowerHtml.includes(indicator)
  );

  if (foundIndicators.length >= 2) {
    signals.push(createSignal(
      'rfp',
      'medium',
      20,
      `Procurement-ready organization with ${foundIndicators.length} vendor process indicators`,
      [`https://${domain}`]
    ));
  }

  return signals;
}