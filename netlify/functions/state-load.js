import { errorResponse, successResponse } from '../lib/http.js';
import { loadStateRecord } from '../lib/storage.js';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      }
    };
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse('Method Not Allowed', 405, {
      source: 'provider_fallback',
      provider: 'state_storage'
    });
  }

  try {
    const { key, namespace } = JSON.parse(event.body || '{}');
    if (!key) {
      return errorResponse('State key is required', 400, {
        source: 'provider_fallback',
        provider: 'state_storage'
      });
    }

    const result = await loadStateRecord(key, namespace);
    if (!result) {
      return successResponse({
        key,
        namespace: namespace || 'inp2-leadgen',
        record: null
      }, {
        source: 'provider_fallback',
        provider: 'state_storage',
        reason: 'No server-side persisted state found for the requested key.',
        confidence: 0.2
      });
    }

    return successResponse({
      key,
      namespace: result.namespace,
      backend: result.backend,
      record: result.record
    }, {
      source: 'provider_live',
      provider: result.backend,
      confidence: 0.9
    });
  } catch (error) {
    console.error('Error loading state:', error);
    return errorResponse('Failed to load state', 500, {
      source: 'provider_fallback',
      provider: 'state_storage'
    });
  }
}
