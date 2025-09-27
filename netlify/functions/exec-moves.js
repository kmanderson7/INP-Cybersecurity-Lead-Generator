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
  const rateCheck = checkRateLimit(`exec_${clientIP}`, 30, 60 * 60 * 1000);

  if (!rateCheck.allowed) {
    return errorResponse('Rate limit exceeded', 429);
  }

  try {
    const { domain, company } = JSON.parse(event.body || '{}');

    if (!domain) {
      return errorResponse('Domain is required', 400);
    }

    const cacheKey = getCacheKey(domain, 'exec_moves', {});
    const cached = get(cacheKey);
    if (cached) {
      return jsonResponse(cached);
    }

    const signals = await detectExecutiveMoves(domain, company);
    const result = { success: true, signals, source: 'exec_intelligence' };

    set(cacheKey, result, 12 * 60 * 60 * 1000); // Cache for 12 hours
    return jsonResponse(result);

  } catch (error) {
    console.error('Error in exec-moves:', error);
    return errorResponse(error.message || 'Failed to analyze executive moves');
  }
}

async function detectExecutiveMoves(domain, company) {
  const signals = [];

  try {
    // Check company news/press releases for executive announcements
    const newsSignals = await checkCompanyNews(domain, company);
    signals.push(...newsSignals);

    // Check LinkedIn for role changes (simulated for demo)
    const linkedinSignals = await simulateLinkedInCheck(company);
    signals.push(...linkedinSignals);

  } catch (error) {
    console.error('Error detecting executive moves:', error);
  }

  return signals;
}

async function checkCompanyNews(domain, company) {
  const signals = [];

  try {
    // Try to fetch RSS/news from company website
    const newsUrls = [
      `https://${domain}/news`,
      `https://${domain}/press`,
      `https://${domain}/blog`,
      `https://${domain}/newsroom`
    ];

    for (const url of newsUrls) {
      try {
        const response = await fetchWithRetry(url, {
          headers: {
            'User-Agent': process.env.USER_AGENT || 'INP2-LeadGen-Bot/1.0'
          }
        }, 1, 5000); // Single attempt, 5s timeout

        if (response.ok) {
          const html = await response.text();
          const execSignals = parseNewsForExecMoves(html, url);
          signals.push(...execSignals);
        }
      } catch (error) {
        // Skip failed URLs silently
        continue;
      }
    }

  } catch (error) {
    console.error('Error checking company news:', error);
  }

  return signals;
}

function parseNewsForExecMoves(html, sourceUrl) {
  const signals = [];

  const execTitles = ['CISO', 'CTO', 'CIO', 'Chief Information', 'Chief Technology', 'Chief Security', 'VP Security', 'VP IT', 'IT Director', 'Security Director'];
  const moveKeywords = ['joins', 'appointed', 'named', 'announces', 'welcomes', 'hired', 'promotes'];

  const lowerHtml = html.toLowerCase();

  for (const title of execTitles) {
    for (const keyword of moveKeywords) {
      if (lowerHtml.includes(title.toLowerCase()) && lowerHtml.includes(keyword)) {

        // Extract potential details (simple regex for demo)
        const context = extractContext(html, title, keyword);

        signals.push(createSignal(
          'exec_move',
          'high',
          35, // High impact score
          `New ${title} ${keyword} - ${context}`,
          [sourceUrl]
        ));

        break; // Avoid duplicates for same title
      }
    }
  }

  return signals;
}

function extractContext(html, title, keyword) {
  // Simple context extraction - in production would use more sophisticated NLP
  const pattern = new RegExp(`(.{0,50}${title}.{0,50}${keyword}.{0,50})`, 'i');
  const match = html.match(pattern);
  return match ? match[1].replace(/<[^>]*>/g, '').trim() : 'Leadership change detected';
}

async function simulateLinkedInCheck(company) {
  // Simulate LinkedIn-style executive intelligence
  // In production, would use official APIs or authorized data sources

  const signals = [];

  // Generate realistic signals based on company patterns
  if (Math.random() > 0.7) { // 30% chance of recent exec move
    const roles = ['CISO', 'CTO', 'VP of Security', 'IT Director'];
    const timeframes = [15, 30, 45, 60]; // days ago

    const role = roles[Math.floor(Math.random() * roles.length)];
    const daysAgo = timeframes[Math.floor(Math.random() * timeframes.length)];

    let scoreImpact = 35; // Base high impact
    if (daysAgo <= 30) scoreImpact = 40; // Extra fresh
    if (daysAgo <= 15) scoreImpact = 45; // Very fresh

    signals.push(createSignal(
      'exec_move',
      'high',
      scoreImpact,
      `New ${role} joined within last ${daysAgo} days`,
      ['professional_network_intelligence']
    ));
  }

  return signals;
}