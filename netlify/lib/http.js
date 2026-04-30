import { wrapError, wrapSuccess } from './source.js';

export async function fetchWithRetry(url, options = {}, retries = 3, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (attempt === retries) {
        throw new Error(`Failed after ${retries} attempts: ${error.message}`);
      }

      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

export async function postJSON(url, body, options = {}) {
  return fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: JSON.stringify(body),
    ...options,
  });
}

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

export function jsonResponse(body, statusCode = 200) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    body: JSON.stringify(body),
  };
}

export function successResponse(data, metaOptions = {}, statusCode = 200) {
  return jsonResponse(wrapSuccess(data, metaOptions), statusCode);
}

export function errorResponse(message, statusCode = 500, metaOptions = {}) {
  return jsonResponse(wrapError(message, metaOptions), statusCode);
}
