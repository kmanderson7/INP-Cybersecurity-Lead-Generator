const rateLimits = new Map();

export function checkRateLimit(identifier, maxRequests = 100, windowMs = 60 * 60 * 1000) {
  const now = Date.now();
  const windowStart = now - windowMs;

  if (!rateLimits.has(identifier)) {
    rateLimits.set(identifier, []);
  }

  const requests = rateLimits.get(identifier);

  // Remove old requests outside the window
  const recentRequests = requests.filter(time => time > windowStart);

  if (recentRequests.length >= maxRequests) {
    return {
      allowed: false,
      resetTime: Math.min(...recentRequests) + windowMs,
      remaining: 0,
    };
  }

  // Add current request
  recentRequests.push(now);
  rateLimits.set(identifier, recentRequests);

  return {
    allowed: true,
    resetTime: now + windowMs,
    remaining: maxRequests - recentRequests.length,
  };
}

export function getRateLimitHeaders(identifier, maxRequests = 100, windowMs = 60 * 60 * 1000) {
  const { remaining, resetTime } = checkRateLimit(identifier, maxRequests, windowMs);

  return {
    'X-RateLimit-Limit': maxRequests.toString(),
    'X-RateLimit-Remaining': remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(resetTime / 1000).toString(),
  };
}