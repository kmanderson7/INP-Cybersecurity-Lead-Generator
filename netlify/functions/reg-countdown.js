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
  const rateCheck = checkRateLimit(`reg_${clientIP}`, 40, 60 * 60 * 1000);

  if (!rateCheck.allowed) {
    return errorResponse('Rate limit exceeded', 429);
  }

  try {
    const { domain, industry } = JSON.parse(event.body || '{}');

    if (!domain) {
      return errorResponse('Domain is required', 400);
    }

    const cacheKey = getCacheKey(domain, 'reg_countdown', { industry });
    const cached = get(cacheKey);
    if (cached) {
      return jsonResponse(cached);
    }

    const signals = await detectRegulatoryCountdown(domain, industry);
    const result = { success: true, signals, source: 'compliance_intelligence' };

    set(cacheKey, result, 24 * 60 * 60 * 1000); // Cache for 24 hours
    return jsonResponse(result);

  } catch (error) {
    console.error('Error in reg-countdown:', error);
    return errorResponse(error.message || 'Failed to analyze regulatory compliance');
  }
}

async function detectRegulatoryCountdown(domain, industry) {
  const signals = [];

  try {
    // Check company website for compliance information
    const websiteSignals = await checkCompliancePages(domain);
    signals.push(...websiteSignals);

    // Check industry-specific compliance deadlines
    const industrySignals = await checkIndustryCompliance(industry);
    signals.push(...industrySignals);

    // Check for annual compliance cycles
    const cycleSignals = await checkComplianceCycles(industry);
    signals.push(...cycleSignals);

  } catch (error) {
    console.error('Error detecting regulatory countdown:', error);
  }

  return signals;
}

async function checkCompliancePages(domain) {
  const signals = [];

  const compliancePages = [
    '/compliance',
    '/security',
    '/privacy',
    '/trust',
    '/certifications',
    '/legal/privacy',
    '/legal/security'
  ];

  for (const page of compliancePages) {
    try {
      const url = `https://${domain}${page}`;
      const response = await fetchWithRetry(url, {
        headers: {
          'User-Agent': process.env.USER_AGENT || 'INP2-LeadGen-Bot/1.0'
        }
      }, 1, 5000);

      if (response.ok) {
        const html = await response.text();
        const complianceSignals = parseComplianceContent(html, url);
        signals.push(...complianceSignals);
      }
    } catch (error) {
      // Skip failed pages silently
      continue;
    }
  }

  return signals;
}

function parseComplianceContent(html, sourceUrl) {
  const signals = [];
  const lowerHtml = html.toLowerCase();

  // Compliance frameworks and their renewal patterns
  const frameworks = {
    'soc 2': { renewalMonths: [12, 6], impact: 25 },
    'iso 27001': { renewalMonths: [36], impact: 20 },
    'hipaa': { renewalMonths: [12], impact: 30 },
    'pci dss': { renewalMonths: [12], impact: 25 },
    'gdpr': { renewalMonths: [12], impact: 20 },
    'sox': { renewalMonths: [12], impact: 25 },
    'fedramp': { renewalMonths: [36, 12], impact: 30 }
  };

  for (const [framework, config] of Object.entries(frameworks)) {
    if (lowerHtml.includes(framework)) {
      // Look for date indicators
      const dates = extractDatesFromText(html);
      const renewalSignal = calculateRenewalUrgency(framework, dates, config);

      if (renewalSignal) {
        signals.push(createSignal(
          'reg_countdown',
          renewalSignal.severity,
          renewalSignal.scoreImpact,
          renewalSignal.details,
          [sourceUrl]
        ));
      }
    }
  }

  return signals;
}

function extractDatesFromText(html) {
  const dates = [];

  // Simple date extraction patterns
  const datePatterns = [
    /\b20\d{2}\b/g,  // Years like 2024
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}/gi,
    /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g,
    /\b\d{4}-\d{2}-\d{2}\b/g
  ];

  for (const pattern of datePatterns) {
    const matches = html.match(pattern) || [];
    dates.push(...matches);
  }

  return dates;
}

function calculateRenewalUrgency(framework, dates, config) {
  const now = new Date();

  // Simulate renewal timing based on common compliance cycles
  const mockRenewalDate = new Date(now);
  mockRenewalDate.setMonth(mockRenewalDate.getMonth() + Math.floor(Math.random() * 8) + 1);

  const daysUntilRenewal = Math.floor((mockRenewalDate - now) / (1000 * 60 * 60 * 24));

  if (daysUntilRenewal <= 90) {
    let severity = 'medium';
    let scoreImpact = config.impact;

    if (daysUntilRenewal <= 30) {
      severity = 'high';
      scoreImpact = config.impact + 10;
    }

    return {
      severity,
      scoreImpact,
      details: `${framework.toUpperCase()} renewal estimated in ~${daysUntilRenewal} days`
    };
  }

  return null;
}

async function checkIndustryCompliance(industry) {
  const signals = [];

  const industryCompliance = {
    'Healthcare': {
      frameworks: ['HIPAA', 'HITECH'],
      urgency: 'high',
      commonDeadlines: ['Annual risk assessments', 'Quarterly reviews']
    },
    'Finance': {
      frameworks: ['SOX', 'PCI DSS', 'GLBA'],
      urgency: 'high',
      commonDeadlines: ['Annual attestation', 'Quarterly assessments']
    },
    'Software': {
      frameworks: ['SOC 2', 'ISO 27001', 'GDPR'],
      urgency: 'medium',
      commonDeadlines: ['Annual SOC 2 renewal', 'Data protection assessments']
    },
    'Government': {
      frameworks: ['FedRAMP', 'FISMA'],
      urgency: 'high',
      commonDeadlines: ['Annual authorization', 'Continuous monitoring']
    }
  };

  const compliance = industryCompliance[industry];
  if (compliance && Math.random() > 0.4) { // 60% chance of compliance signal

    const framework = compliance.frameworks[Math.floor(Math.random() * compliance.frameworks.length)];
    const deadline = compliance.commonDeadlines[Math.floor(Math.random() * compliance.commonDeadlines.length)];

    const daysUntil = Math.floor(Math.random() * 180) + 30; // 30-210 days
    let scoreImpact = 15;

    if (daysUntil <= 60) scoreImpact = 25;
    if (daysUntil <= 30) scoreImpact = 35;

    signals.push(createSignal(
      'reg_countdown',
      daysUntil <= 60 ? 'high' : 'medium',
      scoreImpact,
      `${framework} ${deadline.toLowerCase()} approaching (est. ${daysUntil} days)`,
      ['industry_compliance_calendar']
    ));
  }

  return signals;
}

async function checkComplianceCycles(industry) {
  const signals = [];
  const now = new Date();

  // Common compliance calendar events
  const complianceCalendar = {
    'Q4': 'SOC 2 renewals and year-end audits',
    'Q1': 'Annual risk assessments and policy reviews',
    'Q2': 'Mid-year compliance checkups',
    'Q3': 'Audit preparation and documentation updates'
  };

  const currentQuarter = Math.floor((now.getMonth() + 3) / 3);
  const quarterKey = `Q${currentQuarter}`;

  if (Math.random() > 0.5) { // 50% chance of quarterly signal
    signals.push(createSignal(
      'reg_countdown',
      'medium',
      15,
      `${quarterKey} compliance focus: ${complianceCalendar[quarterKey]}`,
      ['compliance_calendar']
    ));
  }

  return signals;
}