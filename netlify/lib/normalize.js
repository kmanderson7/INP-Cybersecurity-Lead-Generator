import { createHash } from 'crypto';
const signalCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

import { normalizeConfidence } from './source.js';

export function createSignal(type, severity, scoreImpact, details, evidence = [], meta = {}) {
  return {
    id: generateSignalId(type, details),
    type,
    severity,
    scoreImpact,
    occurredAt: new Date().toISOString(),
    details,
    evidence,
    confidence: normalizeConfidence(
      meta.confidence,
      evidence.length > 3 ? 0.85 : evidence.length > 1 ? 0.65 : 0.45
    ),
    meta
  };
}

export function cacheSignal(key, signal, ttl = CACHE_TTL) {
  signalCache.set(key, {
    data: signal,
    timestamp: Date.now(),
    ttl
  });
}

export function getCachedSignal(key) {
  const cached = signalCache.get(key);
  if (!cached) return null;

  if (Date.now() - cached.timestamp > cached.ttl) {
    signalCache.delete(key);
    return null;
  }

  return cached.data;
}

export function clearExpiredCache() {
  const now = Date.now();
  for (const [key, cached] of signalCache.entries()) {
    if (now - cached.timestamp > cached.ttl) {
      signalCache.delete(key);
    }
  }
}

export function normalizeCompanyData(rawData, source = 'unknown') {
  try {
    return {
      id: rawData.id || generateId(),
      name: rawData.name || rawData.company || 'Unknown Company',
      domain: extractDomain(rawData.website || rawData.domain || ''),
      industry: normalizeIndustry(rawData.industry),
      employees: normalizeEmployeeCount(rawData.employees || rawData.employee_count),
      revenue: normalizeRevenue(rawData.revenue || rawData.annual_revenue),
      location: rawData.location || rawData.headquarters || null,
      website: rawData.website || null,
      lastUpdated: new Date().toISOString(),
      source,
      signals: rawData.signals || [],
      score: rawData.score || null,
      priority: rawData.priority || null
    };
  } catch (error) {
    console.error('Failed to normalize company data:', error);
    return {
      id: generateId(),
      name: 'Unknown Company',
      domain: '',
      industry: 'Unknown',
      employees: 0,
      revenue: null,
      location: null,
      website: null,
      lastUpdated: new Date().toISOString(),
      source: 'error',
      signals: [],
      score: 0,
      priority: 'Low'
    };
  }
}

function normalizeIndustry(industry) {
  if (!industry) return 'Unknown';

  const industryMap = {
    'tech': 'Software',
    'technology': 'Software',
    'software': 'Software',
    'saas': 'Software',
    'health': 'Healthcare',
    'medical': 'Healthcare',
    'healthcare': 'Healthcare',
    'financial': 'Finance',
    'fintech': 'Finance',
    'banking': 'Finance',
    'manufacturing': 'Manufacturing',
    'retail': 'Retail',
    'ecommerce': 'Retail'
  };

  const normalized = industryMap[industry.toLowerCase()] || industry;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function normalizeEmployeeCount(employees) {
  if (!employees) return 0;
  if (typeof employees === 'number') return Math.max(0, employees);

  const str = employees.toString().toLowerCase();
  const num = parseInt(str.replace(/[^0-9]/g, ''));

  if (str.includes('k')) return num * 1000;
  if (str.includes('thousand')) return num * 1000;

  return Math.max(0, num || 0);
}

function normalizeRevenue(revenue) {
  if (!revenue) return null;
  if (typeof revenue === 'number') return Math.max(0, revenue);

  const str = revenue.toString().toLowerCase();
  const num = parseFloat(str.replace(/[^0-9.]/g, ''));

  if (str.includes('b') || str.includes('billion')) return num * 1000000000;
  if (str.includes('m') || str.includes('million')) return num * 1000000;
  if (str.includes('k') || str.includes('thousand')) return num * 1000;

  return Math.max(0, num || 0);
}

export function calculateScoreV2(company, signals = []) {
  // Base score from company fundamentals (0-60)
  const baseScore = calculateBaseScore(company);

  // Signal impact aggregation with decay logic
  const signalImpact = calculateSignalImpact(signals);

  // Freshness boost (+5 for <72h updates)
  const freshnessBoost = calculateFreshnessBoost(company.lastUpdated);

  // Staleness decay (0.5 per day since last update, floor at 0)
  const stalenessDecay = calculateStalenessDecay(company.lastUpdated);

  const finalScore = Math.max(0, Math.min(100, baseScore + signalImpact + freshnessBoost - stalenessDecay));

  const scoreBreakdown = {
    base: baseScore,
    signals: signalImpact,
    freshness: freshnessBoost,
    decay: stalenessDecay,
    final: Math.round(finalScore)
  };

  return {
    score: Math.round(finalScore),
    priority: getPriority(finalScore),
    explainScore: generateAdvancedScoreExplanation(scoreBreakdown, signals),
    breakdown: scoreBreakdown,
    topContributors: getTopScoreContributors(signals, scoreBreakdown)
  };
}

export function calculateScore(baseScore = 50, signals = [], freshness = 0, decay = 0) {
  // Legacy function for backward compatibility
  const signalBonus = signals.reduce((sum, signal) => sum + (signal.scoreImpact || 0), 0);
  const finalScore = Math.max(0, Math.min(100, baseScore + signalBonus + freshness - decay));

  return {
    score: Math.round(finalScore),
    priority: getPriority(finalScore),
    explainScore: generateScoreExplanation(baseScore, signals, freshness, decay),
  };
}

export function getPriority(score) {
  if (score >= 80) return 'Critical';
  if (score >= 60) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
}

export const SCORING_PROFILES = {
  cybersecurity: {
    label: 'Cybersecurity',
    titleKeywords: [
      'ciso', 'chief information security officer',
      'cto', 'chief technology officer',
      'cio', 'chief information officer',
      'it director', 'director of it',
      'vp security', 'head of security',
      'chief risk officer', 'head of risk',
      'head of grc', 'grc',
      'privacy officer', 'dpo', 'data protection officer',
      'security'
    ],
    industryKeywords: [
      'healthcare', 'health', 'medical',
      'finance', 'financial', 'banking', 'fintech',
      'software', 'saas', 'technology', 'tech',
      'government', 'public sector',
      'energy', 'utilities',
      'manufacturing',
      'legal',
      'education'
    ]
  },
  commodity_trading: {
    label: 'Commodity Trading',
    titleKeywords: [
      'cfo', 'chief financial officer',
      'treasurer',
      'trade finance',
      'settlement',
      'operations',
      'general counsel',
      'risk',
      'vp finance'
    ],
    industryKeywords: [
      'oil', 'gas', 'energy',
      'commodity', 'trading',
      'midstream',
      'banking', 'finance'
    ]
  }
};

export function scorePerson(person, profile = 'cybersecurity') {
  const profileDef = SCORING_PROFILES[profile] || SCORING_PROFILES.cybersecurity;
  const reasons = [];
  let score = 0;

  const title = (person.title || '').toLowerCase();
  const company = person.organization || person.company || {};
  const companyName = typeof company === 'string' ? company : (company.name || '');
  const industry = (typeof company === 'object' ? (company.industry || '') : '').toLowerCase();

  const matchedTitle = profileDef.titleKeywords.find(term => title.includes(term));
  if (matchedTitle) {
    score += 40;
    reasons.push(`High-intent title (matched "${matchedTitle}"): +40`);
  }

  const matchedIndustry = profileDef.industryKeywords.find(term => industry.includes(term));
  if (matchedIndustry) {
    score += 30;
    reasons.push(`Relevant industry (matched "${matchedIndustry}"): +30`);
  }

  if (person.linkedin_url || person.linkedinUrl) {
    score += 10;
    reasons.push('LinkedIn profile available: +10');
  }

  if (person.email) {
    score += 20;
    reasons.push('Email available: +20');
  }

  return {
    name: person.name || [person.first_name, person.last_name].filter(Boolean).join(' ') || null,
    title: person.title || null,
    company: companyName || null,
    industry: (typeof company === 'object' ? company.industry : null) || null,
    linkedin: person.linkedin_url || person.linkedinUrl || null,
    email: person.email || null,
    score,
    priority: getPriority(score),
    scoreReasons: reasons,
    profile
  };
}

function calculateBaseScore(company) {
  let base = 20; // Minimum base score

  // Industry scoring
  const industryScores = {
    'Healthcare': 15,
    'Finance': 15,
    'Software': 12,
    'Manufacturing': 10,
    'Retail': 8
  };
  base += industryScores[company.industry] || 5;

  // Size scoring
  const employees = company.employees || 0;
  if (employees >= 5000) base += 15;
  else if (employees >= 1000) base += 12;
  else if (employees >= 500) base += 8;
  else if (employees >= 100) base += 5;

  // News/activity scoring
  if (company.news && company.news.length > 0) {
    base += Math.min(company.news.length * 2, 10);
  }

  return Math.min(base, 60);
}

function calculateSignalImpact(signals) {
  return signals.reduce((sum, signal) => {
    const impact = signal.scoreImpact || 0;
    const ageDecay = calculateSignalDecay(signal.occurredAt);
    return sum + (impact * ageDecay);
  }, 0);
}

function calculateSignalDecay(occurredAt) {
  const daysAgo = (Date.now() - new Date(occurredAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysAgo <= 7) return 1.0;
  if (daysAgo <= 14) return 0.9;
  if (daysAgo <= 30) return 0.8;
  if (daysAgo <= 60) return 0.6;
  return 0.4;
}

function calculateFreshnessBoost(lastUpdated) {
  if (!lastUpdated) return 0;
  const hoursAgo = (Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60);
  return hoursAgo <= 72 ? 5 : 0;
}

function calculateStalenessDecay(lastUpdated) {
  if (!lastUpdated) return 0;
  const daysAgo = (Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.floor(daysAgo * 0.5));
}

function generateAdvancedScoreExplanation(breakdown, signals) {
  const explanations = [`Base: ${breakdown.base} (industry, size, activity)`];

  const topSignals = signals
    .sort((a, b) => (b.scoreImpact || 0) - (a.scoreImpact || 0))
    .slice(0, 3);

  topSignals.forEach(signal => {
    if (signal.scoreImpact > 0) {
      const decay = calculateSignalDecay(signal.occurredAt);
      const effective = Math.round((signal.scoreImpact || 0) * decay);
      explanations.push(`${formatSignalType(signal.type)}: +${effective}`);
    }
  });

  if (breakdown.freshness > 0) explanations.push(`Freshness: +${breakdown.freshness}`);
  if (breakdown.decay > 0) explanations.push(`Decay: -${breakdown.decay}`);

  return explanations;
}

function getTopScoreContributors(signals, breakdown) {
  const contributors = [
    { type: 'base', impact: breakdown.base, label: 'Company Fundamentals' }
  ];

  signals
    .sort((a, b) => (b.scoreImpact || 0) - (a.scoreImpact || 0))
    .slice(0, 3)
    .forEach(signal => {
      if (signal.scoreImpact > 0) {
        const decay = calculateSignalDecay(signal.occurredAt);
        const effective = Math.round((signal.scoreImpact || 0) * decay);
        contributors.push({
          type: signal.type,
          impact: effective,
          label: formatSignalType(signal.type),
          details: signal.details
        });
      }
    });

  if (breakdown.freshness > 0) {
    contributors.push({
      type: 'freshness',
      impact: breakdown.freshness,
      label: 'Recent Activity'
    });
  }

  return contributors.sort((a, b) => b.impact - a.impact);
}

function formatSignalType(type) {
  const typeMap = {
    'breach_proximity': 'Breach Proximity',
    'reg_countdown': 'Regulatory Deadline',
    'exec_move': 'Executive Change',
    'ins_renewal': 'Insurance Renewal',
    'surface_regression': 'Security Regression',
    'ai_gap': 'AI Governance Gap',
    'rfp': 'RFP Activity',
    'workforce_stress': 'Workforce Stress',
    'board_heat': 'Board Priority',
    'darkweb': 'Dark Web Exposure',
    'conference': 'Conference Intent',
    'consolidation': 'SaaS Consolidation'
  };
  return typeMap[type] || type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function generateScoreExplanation(base, signals, freshness, decay) {
  const explanations = [`Base score: ${base}`];

  signals.forEach(signal => {
    if (signal.scoreImpact > 0) {
      explanations.push(`${signal.type.replace('_', ' ')}: +${signal.scoreImpact}`);
    }
  });

  if (freshness > 0) explanations.push(`Freshness boost: +${freshness}`);
  if (decay > 0) explanations.push(`Staleness decay: -${decay}`);

  return explanations;
}

function extractDomain(url) {
  if (!url) return '';
  try {
    const domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    return domain.replace(/^www\./, '').toLowerCase();
  } catch {
    const cleaned = url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].toLowerCase();
    return cleaned || '';
  }
}

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function generateSignalId(type, details) {
  return createHash('md5').update(`${type}:${details}:${Date.now()}`).digest('hex').substr(0, 12);
}

// Error handling utilities
export function withErrorHandling(fn, fallback = null) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      console.error(`Function ${fn.name} failed:`, error.message);
      return fallback;
    }
  };
}

export function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  return async (...args) => {
    let lastError;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error;

        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  };
}

// Rate limiting
const rateLimits = new Map();

export function rateLimit(key, maxRequests = 100, windowMs = 60000) {
  const now = Date.now();
  const windowStart = now - windowMs;

  if (!rateLimits.has(key)) {
    rateLimits.set(key, []);
  }

  const requests = rateLimits.get(key);
  const recentRequests = requests.filter(time => time > windowStart);

  if (recentRequests.length >= maxRequests) {
    throw new Error('Rate limit exceeded');
  }

  recentRequests.push(now);
  rateLimits.set(key, recentRequests);

  return true;
}

// Signal validation
export function validateSignal(signal) {
  const required = ['type', 'severity', 'scoreImpact', 'details'];
  const missing = required.filter(field => !(field in signal));

  if (missing.length > 0) {
    throw new Error(`Missing required signal fields: ${missing.join(', ')}`);
  }

  if (!['low', 'medium', 'high'].includes(signal.severity)) {
    throw new Error('Invalid signal severity');
  }

  if (typeof signal.scoreImpact !== 'number' || signal.scoreImpact < 0) {
    throw new Error('Invalid signal score impact');
  }

  return true;
}
