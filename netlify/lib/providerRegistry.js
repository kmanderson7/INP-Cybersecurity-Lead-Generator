import { getApolloProviderConfig } from './source.js';
import { getStorageBackendsStatus } from './storage.js';

export async function getProviderRegistry() {
  const apollo = getApolloProviderConfig();
  const storage = await getStorageBackendsStatus();

  const emailProvider = process.env.EMAIL_PROVIDER || 'sendgrid';
  const emailConfigured = (emailProvider === 'sendgrid' && Boolean(process.env.SENDGRID_API_KEY))
    || (emailProvider === 'mailgun' && Boolean(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN));

  const providers = [
    mapProvider('Apollo (Laminar)', apollo.mode === 'laminar', apollo.mode !== 'mock', apollo.mode === 'laminar' ? 'live' : apollo.mode === 'legacy' ? 'fallback' : 'mock-only'),
    mapProvider('Apollo Legacy', apollo.mode === 'legacy', Boolean(process.env.APOLLO_API_KEY), apollo.mode === 'legacy' ? 'fallback' : process.env.APOLLO_API_KEY ? 'configured' : 'mock-only'),
    mapProvider('News API', Boolean(process.env.NEWS_API_KEY), Boolean(process.env.NEWS_API_KEY), process.env.NEWS_API_KEY ? 'live' : 'mock-only'),
    mapProvider('OpenAI', Boolean(process.env.OPENAI_API_KEY), Boolean(process.env.OPENAI_API_KEY), process.env.OPENAI_API_KEY ? 'live' : 'fallback'),
    mapProvider('Email Provider', emailConfigured, emailConfigured, emailConfigured ? 'live' : 'simulated'),
    mapProvider('JSearch', Boolean(process.env.JSEARCH_RAPIDAPI_KEY), Boolean(process.env.JSEARCH_RAPIDAPI_KEY), process.env.JSEARCH_RAPIDAPI_KEY ? 'live' : 'fallback'),
    mapProvider('SAM.gov', Boolean(process.env.SAM_GOV_API_KEY), Boolean(process.env.SAM_GOV_API_KEY), process.env.SAM_GOV_API_KEY ? 'live' : 'fallback'),
    mapProvider('SerpAPI', Boolean(process.env.SERPAPI_API_KEY), Boolean(process.env.SERPAPI_API_KEY), process.env.SERPAPI_API_KEY ? 'live' : 'fallback'),
    mapProvider('Netlify Blobs', storage.netlifyBlobs, storage.netlifyBlobs, storage.netlifyBlobs ? 'live' : 'fallback'),
    mapProvider('Supabase', storage.supabase, storage.supabase, storage.supabase ? 'configured' : 'fallback')
  ];

  return providers;
}

function mapProvider(name, configured, live, mode) {
  return {
    name,
    configured,
    live,
    mode
  };
}
