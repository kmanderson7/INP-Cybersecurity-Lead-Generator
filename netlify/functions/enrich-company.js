// netlify/functions/enrich-company.js
import OpenAI from "openai";
import { errorResponse, successResponse } from '../lib/http.js';
import { requireLiveDataEnabled } from '../lib/source.js';

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders() };
  }
  if (event.httpMethod !== "POST") {
    return errorResponse('Method Not Allowed', 405, { provider: 'company_enrichment', source: 'mock' });
  }

  const { domain } = JSON.parse(event.body || "{}");
  if (!domain) {
    return errorResponse('domain is required', 400, { provider: 'company_enrichment', source: 'mock' });
  }

  const openAiKey = process.env.OPENAI_API_KEY;
  console.log("OpenAI key loaded:", openAiKey ? "✅" : "❌ missing");
  if (!openAiKey) {
    if (requireLiveDataEnabled()) {
      return errorResponse('Live company enrichment is required but OpenAI is not configured.', 503, {
        provider: 'openai',
        source: 'mock',
        reason: 'REQUIRE_LIVE_DATA blocked mock company enrichment.'
      });
    }

    return successResponse({
      domain,
      analysis: buildMockAnalysis()
    }, {
      provider: 'company_enrichment_mock',
      source: 'mock',
      reason: 'OpenAI API key missing; returned labeled mock enrichment analysis.',
      confidence: 0.25
    });
  }

  try {
    // 1) Fetch HTML from the company site
    const url = domain.startsWith("http") ? domain : `https://${domain}`;
    const res = await fetch(url, { redirect: "follow" });
    const html = await res.text();

    // 2) Ask OpenAI to extract tech/security signals (structured JSON)
    const client = new OpenAI({ apiKey: openAiKey });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a cybersecurity analyst. From website HTML, infer the likely tech stack and security posture. Output strict JSON with keys: frontEnd (array), backEnd (array), cms (array), hosting (array), analytics (array), securityTools (array), signals (array of short strings), confidence (0-100), summary (string). Do not include code blocks."
        },
        {
          role: "user",
          content:
`Domain: ${url}

HTML:
${html.slice(0, 120000)}`
        }
      ],
      temperature: 0.2,
      max_tokens: 800
    });

    const parsed = safeParse(completion.choices?.[0]?.message?.content);

    return successResponse({
      domain: url,
      analysis: parsed || {
        frontEnd: [],
        backEnd: [],
        cms: [],
        hosting: [],
        analytics: [],
        securityTools: [],
        signals: [],
        confidence: 0,
        summary: "No structured analysis returned."
      }
    }, {
      provider: 'openai',
      source: 'ai_synthesized',
      confidence: typeof parsed?.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence / 100)) : 0.62
    });
  } catch (err) {
    console.error(err);
    return errorResponse('Failed to enrich company', 500, {
      provider: 'openai',
      source: 'ai_synthesized'
    });
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}
function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function buildMockAnalysis() {
  return {
    frontEnd: [],
    backEnd: [],
    cms: [],
    hosting: [],
    analytics: [],
    securityTools: [],
    signals: ['Mock enrichment only: no live site analysis performed'],
    confidence: 20,
    summary: 'Company enrichment is running in mock mode because OpenAI is not configured.'
  };
}
