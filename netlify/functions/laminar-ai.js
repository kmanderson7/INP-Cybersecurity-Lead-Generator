import { jsonResponse, errorResponse, successResponse } from '../lib/http.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { requireLiveDataEnabled } from '../lib/source.js';
import OpenAI from 'openai';

const PROMPTS = {
  executiveInsight: {
    system: `You are a senior trade finance analyst working for Kirk Anderson at Laminar Digital.
Laminar Digital is a programmable settlement rail for physical crude oil that replaces
Letter of Credit (LC) processes with atomic, condition-based settlement.

Your job is to write a single, sharp executive insight for a specific prospect company.
This insight will appear on their lead card in a sales dashboard.

RULES — THESE ARE NON-NEGOTIABLE:
1. Write exactly 1-2 sentences. No more.
2. Lead with the working capital or financial pain angle. Never lead with technology.
3. Never use the words: crypto, blockchain, cryptocurrency, XRP, XRPL, NFT, token, ledger, DeFi, Web3, digital asset.
4. Use "programmable settlement" or "settlement rail" if the technology must be named.
5. If a working capital figure is available, include it.
6. If a signal is present (new exec, earnings mention, regulatory deadline), reference it as urgency.
7. Tone: precise, peer-level, no hype.

OUTPUT: Plain text only. No quotes, no bullets, no markdown.`,
    userTemplate: `Company: {{company}}
Segment: {{segment}}
Annual Cargoes: {{annualCargoes}}
Avg Cargo Value: \${{avgCargoValue}}
Working Capital Locked (est.): \${{workingCapitalLocked}}
Settlement Method: {{currentSettlementMethod}}
Top Signal: {{topSignal}}
Recent News: {{recentNews}}

Write the executive insight.`
  },

  outreach: {
    system: `You are Kirk Anderson's senior outreach strategist at Laminar Digital.
Laminar Digital replaces the Letter of Credit process — typically 20-30 days and
$25,000-$100,000 per cargo — with condition-based settlement that releases working capital same-day.

You write cold outreach emails that get replies from senior energy and trade finance executives.

HARD RULES — VIOLATION INVALIDATES THE OUTPUT:
1. NEVER use: crypto, cryptocurrency, blockchain, XRP, XRPL, NFT, token, ledger, DeFi, Web3, digital asset.
2. ALWAYS lead the body with a working-capital figure specific to this company. Format: "$[X]M sitting in your settlement pipeline right now" or equivalent.
3. If the settlement currency must be named, call it "USD-backed digital settlement" or "RLUSD (a USD-backed settlement instrument supervised by the OCC and NYDFS)".
4. CTA must be a 20-minute call. "Worth 20 minutes?" is preferred. Never request demos or longer meetings.
5. Bank officer's role is preserved: "Your {role} still approves credit."
6. Trader's workflow unchanged: "Nothing changes for the trader."
7. Body <= 150 words.
8. Subject line references a specific dollar figure or specific urgency event. Never generic.
9. Generate exactly 2 variants with different subjects and slightly different angles.

PERSONA ADAPTATIONS:
- CFO/Treasurer: Working capital math. Balance sheet impact.
- Head of Trade Finance / Bank: Credit velocity. 10x transaction volume on same balance sheet.
- Operations Director: Document ambiguity removal. The four-pillar release condition.
- Chief Risk Officer: Audit trail. BSA compliance. Settlement record.
- Midstream / Terminal Operator: Payment certainty on delivery confirmation.

OUTPUT: Valid JSON only. No markdown fences. Schema:
{
  "variant_a": { "subject": string, "body": string },
  "variant_b": { "subject": string, "body": string }
}`,
    userTemplate: `Company: {{company}}
Contact: {{contactName}}, {{contactTitle}}
Persona: {{persona}}
Tone: {{tone}}
Annual Cargoes: {{annualCargoes}}
Avg Cargo Value: \${{avgCargoValue}}
Working Capital Locked: \${{workingCapitalLocked}}
Annual LC Cost: \${{lcCostLow}} - \${{lcCostHigh}}
Settlement Method: {{currentSettlementMethod}}
Top Signal: {{topSignal}}
Recent News: {{recentNews}}
Region: {{region}}
Sender: Kirk Anderson

Write 2 variants.`
  },

  decisionCards: {
    system: `You are a strategic advisor to Kirk Anderson at Laminar Digital.
For each lead, generate three short decision card texts that appear on the lead's
detail Overview tab.

WHY NOW: Specific, time-sensitive reason this company needs outreach now. Reference a real
  signal or working-capital condition. 1-2 sentences.
FIRST MOVE: Exact recommended opening conversation. Specific enough that Kirk knows what to
  say first. 1 sentence. Start with an action verb.
RISK: What Kirk loses by waiting 30-60 days. Concrete and financial where possible. 1 sentence.

RULES:
- Never use: crypto, blockchain, XRP, NFT, token, ledger, DeFi, Web3, digital asset.
- Make each card feel researched, not generic.
- If a signal exists, reference it ("The new CFO at...").
- Use working-capital figures in Risk when available.

OUTPUT: Valid JSON only. Schema:
{
  "whyNow": string,
  "firstMove": string,
  "risk": string
}`,
    userTemplate: `Company: {{company}}
Segment: {{segment}}
Working Capital Locked: \${{workingCapitalLocked}}
Top Signal: {{topSignal}}
Top Signal Date: {{signalDate}}
Score: {{score}}
Priority: {{priority}}
Recent News: {{recentNews}}
Contacts: {{contactTitles}}

Generate the three decision cards.`
  },

  workingCapitalNarrative: {
    system: `You are a treasury advisor at Laminar Digital writing a 3-sentence working-capital impact
summary for a specific company. This text appears in the Overview tab of the lead detail view,
below the working-capital calculator.

The summary must:
1. State the estimated working capital locked in current settlement cycles.
2. Explain what that means for their balance sheet or operations specifically.
3. State what changes with same-day settlement — in capital terms, not technology.

RULES:
- Never use: crypto, blockchain, XRP, NFT, token, ledger, DeFi, Web3, digital asset.
- Use concrete dollar figures.
- Write at CFO / Treasury audience level.
- Exactly 3 sentences. No more, no less.

OUTPUT: Plain text only.`,
    userTemplate: `Company: {{company}}
Annual Cargoes: {{annualCargoes}}
Avg Cargo Value: \${{avgCargoValue}}
Working Capital Locked: \${{workingCapitalLocked}}
Annual LC Cost: \${{lcCostLow}} - \${{lcCostHigh}}
Segment: {{segment}}
Settlement Method: {{currentSettlementMethod}}

Write the narrative.`
  },

  explainScore: {
    system: `You are a scoring analyst for Laminar Digital's lead intelligence system.
Explain why a specific company received its lead score in plain executive-level language.
Focus on what the score means for outreach timing and strategy — not on the math.

OUTPUT: Valid JSON only. Schema:
{
  "summary": string,
  "topFactors": [{ "factor": string, "impact": number, "explanation": string }],
  "recommendation": string
}
Top factors: exactly 3, sorted by impact descending.`,
    userTemplate: `Company: {{company}}
Score: {{score}}
Priority: {{priority}}
Score factors: {{factorsJSON}}
Working Capital Locked: \${{workingCapitalLocked}}
Top Signal: {{topSignal}}

Explain.`
  }
};

function renderTemplate(tmpl, payload) {
  return tmpl.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = payload?.[key];
    if (v === undefined || v === null || v === '') return 'n/a';
    return String(v);
  });
}

function buildFallback(feature, payload) {
  switch (feature) {
    case 'executiveInsight':
      return `${payload.company || 'This company'} has an estimated $${payload.workingCapitalLocked || '0'} in working capital locked in current settlement cycles. Same-day settlement frees that capital for the balance sheet.`;
    case 'outreach':
      return JSON.stringify({
        variant_a: {
          subject: `${payload.workingCapitalLocked ? '$' + payload.workingCapitalLocked + ' working capital review' : 'Settlement workflow review'}`,
          body: `Hi ${payload.contactName || 'there'},\n\n$${payload.workingCapitalLocked || 'X'} sitting in your settlement pipeline right now. Programmable settlement releases that same-day.\n\nNothing changes for the trader. Your ${payload.persona || 'role'} still approves credit.\n\nWorth 20 minutes?\n\n— Kirk Anderson`
        },
        variant_b: {
          subject: `${payload.company || 'Your team'}: 20-day to same-day settlement`,
          body: `Hi ${payload.contactName || 'there'},\n\n10x credit velocity on the same balance sheet — that is what same-day settlement does for ${payload.company || 'your team'}.\n\nNothing changes for the trader.\n\nWorth 20 minutes?\n\n— Kirk Anderson`
        }
      });
    case 'decisionCards':
      return JSON.stringify({
        whyNow: payload.topSignal && payload.topSignal !== 'n/a'
          ? `${payload.topSignal} creates an opening for a conversation now.`
          : `Working capital math is timely with current settlement cycles.`,
        firstMove: `Lead with the working-capital figure: $${payload.workingCapitalLocked || 'estimated total'} locked in settlement.`,
        risk: `Waiting 30-60 days delays $${payload.workingCapitalLocked || 'significant capital'} that could be on the balance sheet.`
      });
    case 'workingCapitalNarrative':
      return `${payload.company || 'This company'} has an estimated $${payload.workingCapitalLocked || '0'} of working capital locked in 20-day settlement cycles. That capital would otherwise be available for trading limits, credit lines, or yield. Same-day settlement frees the entire amount on confirmation.`;
    case 'explainScore':
      return JSON.stringify({
        summary: `Score ${payload.score || 0} — ${payload.priority || 'unrated'} priority based on segment fit and recent signals.`,
        topFactors: [
          { factor: 'Segment fit', impact: 20, explanation: 'Company matches a tracked Laminar segment.' },
          { factor: 'Lead score', impact: 15, explanation: 'Calibrated by Apollo enrichment.' },
          { factor: 'Recent signals', impact: 10, explanation: 'Recent activity on this account.' }
        ],
        recommendation: `Outreach in the next 7 days; lead with working capital math.`
      });
    default:
      return '';
  }
}

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
    return errorResponse('Method Not Allowed', 405);
  }

  const clientIP = event.headers['client-ip'] || event.headers['x-forwarded-for'] || 'anonymous';
  const rate = checkRateLimit(`laminar_ai_${clientIP}`, 30, 60 * 60 * 1000);
  if (!rate.allowed) return errorResponse('Rate limit exceeded', 429);

  try {
    const { feature, payload = {} } = JSON.parse(event.body || '{}');
    const prompt = PROMPTS[feature];
    if (!prompt) return errorResponse(`Unknown feature: ${feature}`, 400);

    if (!process.env.OPENAI_API_KEY) {
      if (requireLiveDataEnabled()) {
        return errorResponse('OPENAI_API_KEY not configured', 503, {
          source: 'provider_fallback',
          provider: 'openai',
          reason: 'REQUIRE_LIVE_DATA blocked Laminar AI fallback.'
        });
      }
      return successResponse({ result: buildFallback(feature, payload) }, {
        source: 'provider_fallback',
        provider: 'laminar_ai_fallback',
        confidence: 0.3
      });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const userMessage = renderTemplate(prompt.userTemplate, payload);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1000,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: userMessage }
      ]
    });

    const result = completion.choices?.[0]?.message?.content || '';
    return successResponse({ result }, {
      source: 'provider_live',
      provider: 'openai',
      confidence: 0.85
    });
  } catch (error) {
    console.error('[laminar-ai] error:', error);
    return errorResponse(error.message || 'Laminar AI dispatch failed', 500, {
      source: 'provider_fallback',
      provider: 'laminar_ai'
    });
  }
}
