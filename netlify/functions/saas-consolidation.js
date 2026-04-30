import { createHash } from 'crypto';
import { errorResponse, successResponse } from '../lib/http.js';
import { attachSignalMeta } from '../lib/source.js';

function generateCacheKey(domain, company) {
  return createHash('md5').update(`saas-consolidation:${domain}:${company}`).digest('hex');
}

function generateTechStack(domain, company) {
  const hash = createHash('md5').update(`${domain}${company}`).digest('hex');
  const hashNum = parseInt(hash.substring(0, 8), 16);

  const operationsTools = [
    'FIS Quantum', 'Kyriba', 'ION', 'Coupa', 'SAP Treasury',
    'GT Nexus', 'Bottomline', 'Murex', 'Finastra', 'Misys',
    'DocuSign', 'Adobe Sign', 'PandaDoc', 'ServiceNow',
    'Salesforce', 'HubSpot', 'Slack', 'Zoom'
  ];

  const currentStack = [];
  const toolCount = (hashNum % 8) + 6;

  for (let i = 0; i < toolCount; i += 1) {
    const toolIndex = (hashNum + i * 7) % operationsTools.length;
    const category = i < 2 ? 'Treasury' : i < 4 ? 'Workflow' : i < 6 ? 'Documentation' : 'Operations';
    const monthlyCost = ((hashNum + i * 11) % 900) + 250;

    currentStack.push({
      name: operationsTools[toolIndex],
      category,
      monthlyCost,
      userCount: ((hashNum + i * 13) % 220) + 20
    });
  }

  return currentStack;
}

function findOverlaps(techStack) {
  const overlaps = [];
  const categories = {};

  techStack.forEach((tool) => {
    if (!categories[tool.category]) {
      categories[tool.category] = [];
    }
    categories[tool.category].push(tool);
  });

  Object.entries(categories).forEach(([category, tools]) => {
    if (tools.length > 1) {
      for (let i = 0; i < tools.length; i += 1) {
        for (let j = i + 1; j < tools.length; j += 1) {
          const tool1 = tools[i];
          const tool2 = tools[j];

          overlaps.push({
            category,
            tools: [tool1.name, tool2.name],
            potentialSavings: Math.min(tool1.monthlyCost, tool2.monthlyCost) * 0.7,
            consolidationComplexity: tool1.userCount > 100 || tool2.userCount > 100 ? 'high' : 'medium',
            recommendation: `Consider consolidating ${tool1.name} and ${tool2.name} in ${category}`
          });
        }
      }
    }
  });

  return overlaps;
}

function calculateSavings(overlaps, techStack) {
  const totalCurrentCost = techStack.reduce((sum, tool) => sum + tool.monthlyCost, 0);
  const totalPotentialSavings = overlaps.reduce((sum, overlap) => sum + overlap.potentialSavings, 0);
  const estSavingsPct = totalCurrentCost > 0 ? (totalPotentialSavings / totalCurrentCost) * 100 : 0;

  return {
    totalCurrentCost,
    totalPotentialSavings: Math.round(totalPotentialSavings),
    estSavingsPct: Math.round(estSavingsPct * 10) / 10,
    annualSavings: Math.round(totalPotentialSavings * 12)
  };
}

function generateConsolidationPlan(overlaps) {
  const plan = { quickWins: [], mediumTerm: [], strategic: [] };

  overlaps.forEach((overlap) => {
    const item = {
      category: overlap.category,
      tools: overlap.tools,
      savings: overlap.potentialSavings,
      complexity: overlap.consolidationComplexity
    };

    if (overlap.consolidationComplexity === 'low' && overlap.potentialSavings > 100) {
      plan.quickWins.push(item);
    } else if (overlap.consolidationComplexity === 'medium') {
      plan.mediumTerm.push(item);
    } else {
      plan.strategic.push(item);
    }
  });

  return plan;
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse('Method not allowed', 405, {
      source: 'provider_fallback',
      provider: 'saas_consolidation'
    });
  }

  try {
    const { domain, company } = JSON.parse(event.body || '{}');
    if (!domain || !company) {
      return errorResponse('Domain and company name are required', 400, {
        source: 'provider_fallback',
        provider: 'saas_consolidation'
      });
    }

    const cacheKey = generateCacheKey(domain, company);
    const techStack = generateTechStack(domain, company);
    const overlaps = findOverlaps(techStack);
    const savings = calculateSavings(overlaps, techStack);
    const consolidationPlan = generateConsolidationPlan(overlaps);
    const scoreImpact = Math.round(savings.estSavingsPct * 0.5);
    const severity = savings.estSavingsPct >= 20 ? 'high' : savings.estSavingsPct >= 10 ? 'medium' : 'low';

    const signals = attachSignalMeta([{
      id: `${cacheKey}:consolidation`,
      type: 'consolidation',
      severity,
      scoreImpact,
      occurredAt: new Date().toISOString(),
      details: `${overlaps.length} consolidation opportunities identified: ${savings.estSavingsPct}% potential savings ($${savings.annualSavings}/year)`,
      evidence: [
        `Current tools: ${techStack.length}`,
        `Overlap opportunities: ${overlaps.length}`,
        `Potential savings: ${savings.estSavingsPct}%`,
        `Annual savings: $${savings.annualSavings}`,
        `Quick wins: ${consolidationPlan.quickWins.length}`
      ]
    }], {
      source: 'provider_fallback',
      provider: 'stack_model',
      confidence: 0.41
    });

    return successResponse({
      domain,
      company,
      techStack,
      overlaps,
      savings,
      consolidationPlan,
      signals,
      metadata: {
        cacheKey,
        timestamp: new Date().toISOString(),
        ttl: 7 * 24 * 60 * 60 * 1000
      }
    }, {
      source: 'provider_fallback',
      provider: 'stack_model',
      reason: 'SaaS consolidation remains heuristic until a live stack provider such as BuiltWith is integrated.',
      confidence: 0.41
    });
  } catch (error) {
    console.error('SaaS consolidation analysis error:', error);
    return errorResponse('Failed to analyze SaaS consolidation opportunities', 500, {
      source: 'provider_fallback',
      provider: 'saas_consolidation'
    });
  }
}
