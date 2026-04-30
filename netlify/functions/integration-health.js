import { errorResponse, successResponse } from '../lib/http.js';
import { getProviderRegistry } from '../lib/providerRegistry.js';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      }
    };
  }

  if (event.httpMethod !== 'GET') {
    return errorResponse('Method Not Allowed', 405, {
      source: 'provider_fallback',
      provider: 'provider_registry'
    });
  }

  try {
    const providers = await getProviderRegistry();
    return successResponse({
      providers
    }, {
      source: 'provider_live',
      provider: 'provider_registry',
      confidence: 0.88
    });
  } catch (error) {
    console.error('Integration health error:', error);
    return errorResponse('Failed to load integration health', 500, {
      source: 'provider_fallback',
      provider: 'provider_registry'
    });
  }
}
