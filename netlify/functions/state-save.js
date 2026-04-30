import { errorResponse, successResponse } from '../lib/http.js';
import { saveStateRecord } from '../lib/storage.js';

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
    const { key, namespace, data } = JSON.parse(event.body || '{}');
    if (!key) {
      return errorResponse('State key is required', 400, {
        source: 'provider_fallback',
        provider: 'state_storage'
      });
    }

    const result = await saveStateRecord(key, data, namespace);

    return successResponse({
      key,
      namespace: result.namespace,
      backend: result.backend,
      record: result.record
    }, {
      source: result.backend === 'client_fallback' ? 'provider_fallback' : 'provider_live',
      provider: result.backend,
      reason: result.backend === 'client_fallback'
        ? 'Server storage was unavailable; the client should keep the local fallback copy.'
        : undefined,
      confidence: result.backend === 'client_fallback' ? 0.45 : 0.92
    });
  } catch (error) {
    console.error('Error saving state:', error);
    return errorResponse('Failed to save state', 500, {
      source: 'provider_fallback',
      provider: 'state_storage'
    });
  }
}
