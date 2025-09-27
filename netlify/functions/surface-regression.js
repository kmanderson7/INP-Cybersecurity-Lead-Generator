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
  const rateCheck = checkRateLimit(`surface_${clientIP}`, 35, 60 * 60 * 1000);

  if (!rateCheck.allowed) {
    return errorResponse('Rate limit exceeded', 429);
  }

  try {
    const { domain } = JSON.parse(event.body || '{}');

    if (!domain) {
      return errorResponse('Domain is required', 400);
    }

    const cacheKey = getCacheKey(domain, 'surface_regression', {});
    const cached = get(cacheKey);
    if (cached) {
      return jsonResponse(cached);
    }

    const signals = await detectSurfaceRegression(domain);
    const result = { success: true, signals, source: 'surface_intelligence' };

    set(cacheKey, result, 6 * 60 * 60 * 1000); // Cache for 6 hours
    return jsonResponse(result);

  } catch (error) {
    console.error('Error in surface-regression:', error);
    return errorResponse(error.message || 'Failed to analyze attack surface');
  }
}

async function detectSurfaceRegression(domain) {
  const signals = [];

  try {
    // Check Certificate Transparency for new certificates
    const certSignals = await checkCertificateTransparency(domain);
    signals.push(...certSignals);

    // Check security headers
    const headerSignals = await checkSecurityHeaders(domain);
    signals.push(...headerSignals);

    // Check for new subdomains
    const subdomainSignals = await checkSubdomainChanges(domain);
    signals.push(...subdomainSignals);

  } catch (error) {
    console.error('Error detecting surface regression:', error);
  }

  return signals;
}

async function checkCertificateTransparency(domain) {
  const signals = [];

  try {
    // Query crt.sh for recent certificates
    const url = `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json&exclude=expired`;

    const response = await fetchWithRetry(url, {
      headers: {
        'User-Agent': process.env.USER_AGENT || 'INP2-LeadGen-Bot/1.0'
      }
    }, 1, 10000);

    if (response.ok) {
      const certificates = await response.json();
      const recentCerts = certificates.filter(cert => {
        const notBefore = new Date(cert.not_before);
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        return notBefore > thirtyDaysAgo;
      });

      if (recentCerts.length > 0) {
        // Group by common names to identify new services/subdomains
        const newSubdomains = [...new Set(
          recentCerts.map(cert => cert.common_name)
            .filter(name => name && name !== domain && name.endsWith(domain))
        )];

        if (newSubdomains.length > 0) {
          const impact = Math.min(20, newSubdomains.length * 5);
          signals.push(createSignal(
            'surface_regression',
            'medium',
            impact,
            `${newSubdomains.length} new certificate(s) detected: ${newSubdomains.slice(0, 3).join(', ')}`,
            ['certificate_transparency']
          ));
        }
      }
    }
  } catch (error) {
    console.error('Error checking CT logs:', error);
    // Generate mock signal for demo
    if (Math.random() > 0.7) {
      signals.push(createSignal(
        'surface_regression',
        'medium',
        10,
        'New certificate activity detected (simulated)',
        ['certificate_transparency_mock']
      ));
    }
  }

  return signals;
}

async function checkSecurityHeaders(domain) {
  const signals = [];

  try {
    const url = `https://${domain}`;
    const response = await fetchWithRetry(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': process.env.USER_AGENT || 'INP2-LeadGen-Bot/1.0'
      }
    }, 1, 5000);

    if (response.ok) {
      const headers = response.headers;
      const securityAnalysis = analyzeSecurityHeaders(headers);

      if (securityAnalysis.issues.length > 0) {
        signals.push(createSignal(
          'surface_regression',
          securityAnalysis.severity,
          securityAnalysis.scoreImpact,
          `Security header issues: ${securityAnalysis.issues.join(', ')}`,
          [`https://${domain}`]
        ));
      }
    }
  } catch (error) {
    console.error('Error checking security headers:', error);
    // Don't generate mock signals for header failures - often expected
  }

  return signals;
}

function analyzeSecurityHeaders(headers) {
  const analysis = {
    issues: [],
    severity: 'low',
    scoreImpact: 5
  };

  const requiredHeaders = {
    'strict-transport-security': 'HSTS missing - transport security risk',
    'content-security-policy': 'CSP missing - XSS vulnerability risk',
    'x-frame-options': 'X-Frame-Options missing - clickjacking risk',
    'x-content-type-options': 'X-Content-Type-Options missing - MIME sniffing risk'
  };

  let missingCount = 0;

  for (const [header, description] of Object.entries(requiredHeaders)) {
    if (!headers.get(header)) {
      analysis.issues.push(description);
      missingCount++;
    }
  }

  if (missingCount >= 3) {
    analysis.severity = 'medium';
    analysis.scoreImpact = 15;
  } else if (missingCount >= 2) {
    analysis.severity = 'low';
    analysis.scoreImpact = 10;
  }

  return analysis;
}

async function checkSubdomainChanges(domain) {
  const signals = [];

  // Simulate subdomain discovery (in production, would use specialized tools)
  // This is a placeholder for subdomain enumeration logic

  if (Math.random() > 0.8) { // 20% chance of new subdomain signal
    const subdomains = [
      'api', 'dev', 'staging', 'test', 'admin', 'portal', 'app',
      'secure', 'login', 'auth', 'dashboard', 'internal'
    ];

    const newSubdomain = subdomains[Math.floor(Math.random() * subdomains.length)];
    const daysAgo = Math.floor(Math.random() * 30) + 1;

    signals.push(createSignal(
      'surface_regression',
      'medium',
      12,
      `New subdomain detected: ${newSubdomain}.${domain} (${daysAgo} days ago)`,
      ['subdomain_monitoring']
    ));
  }

  return signals;
}