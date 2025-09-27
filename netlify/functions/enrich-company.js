// netlify/functions/enrich-company.js
import OpenAI from "openai";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders() };
  }
  if (event.httpMethod !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  const { domain } = JSON.parse(event.body || "{}");
  if (!domain) return json({ success: false, error: "domain is required" }, 400);

  const openAiKey = process.env.OPENAI_API_KEY;
  console.log("OpenAI key loaded:", openAiKey ? "✅" : "❌ missing");
  if (!openAiKey) return json({ success: false, error: "Missing OpenAI API key" }, 500);

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

    return json({
      success: true,
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
    });
  } catch (err) {
    console.error(err);
    return json({ success: false, error: err.message }, 500);
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}
function json(body, statusCode = 200) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
    body: JSON.stringify(body)
  };
}
function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}
