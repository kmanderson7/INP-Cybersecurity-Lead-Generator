const { createHash } = require('crypto');

function generateCacheKey(domain, company) {
  return createHash('md5').update(`saas-consolidation:${domain}:${company}`).digest('hex');
}

function generateTechStack(domain, company) {
  const hash = createHash('md5').update(`${domain}${company}`).digest('hex');
  const hashNum = parseInt(hash.substring(0, 8), 16);

  const securityTools = [
    'Okta', 'Auth0', 'Ping Identity', 'Microsoft Azure AD',
    'CrowdStrike', 'SentinelOne', 'Carbon Black', 'Cylance',
    'Splunk', 'LogRhythm', 'QRadar', 'ArcSight',
    'Qualys', 'Rapid7', 'Tenable', 'Veracode',
    'KnowBe4', 'Proofpoint', 'Mimecast', 'Forcepoint',
    'Palo Alto Networks', 'Fortinet', 'Check Point', 'Cisco',
    'Duo Security', 'RSA', 'Symantec', 'McAfee'
  ];

  const productivityTools = [
    'Microsoft 365', 'Google Workspace', 'Slack', 'Zoom',
    'Salesforce', 'HubSpot', 'Zendesk', 'ServiceNow',
    'Jira', 'Confluence', 'Notion', 'Monday.com',
    'DocuSign', 'Adobe Sign', 'PandaDoc', 'HelloSign'
  ];

  const currentStack = [];
  const numSecurityTools = (hashNum % 8) + 4;
  const numProductivityTools = ((hashNum >> 4) % 6) + 3;

  for (let i = 0; i < numSecurityTools; i++) {
    const toolIndex = (hashNum + i * 7) % securityTools.length;
    const category = i < 2 ? 'Identity' : i < 4 ? 'Endpoint' : i < 6 ? 'SIEM' : 'Other';
    const monthlyCost = ((hashNum + i * 11) % 500) + 200;

    currentStack.push({
      name: securityTools[toolIndex],
      category,
      type: 'security',
      monthlyCost,
      userCount: ((hashNum + i * 13) % 200) + 50
    });
  }

  for (let i = 0; i < numProductivityTools; i++) {
    const toolIndex = (hashNum + i * 9) % productivityTools.length;
    const category = i < 2 ? 'Collaboration' : i < 4 ? 'CRM' : 'Other';
    const monthlyCost = ((hashNum + i * 15) % 300) + 100;

    currentStack.push({
      name: productivityTools[toolIndex],
      category,
      type: 'productivity',
      monthlyCost,
      userCount: ((hashNum + i * 17) % 150) + 25
    });
  }

  return currentStack;
}

function findOverlaps(techStack) {
  const overlaps = [];
  const categories = {};

  techStack.forEach(tool => {
    if (!categories[tool.category]) {
      categories[tool.category] = [];
    }
    categories[tool.category].push(tool);
  });

  Object.entries(categories).forEach(([category, tools]) => {
    if (tools.length > 1) {
      for (let i = 0; i < tools.length; i++) {
        for (let j = i + 1; j < tools.length; j++) {
          const tool1 = tools[i];
          const tool2 = tools[j];

          const overlap = {
            category,
            tools: [tool1.name, tool2.name],
            potentialSavings: Math.min(tool1.monthlyCost, tool2.monthlyCost) * 0.7,
            consolidationComplexity: tool1.userCount > 100 || tool2.userCount > 100 ? 'high' : 'medium',
            recommendation: `Consider consolidating ${tool1.name} and ${tool2.name} in ${category}`
          };

          overlaps.push(overlap);
        }
      }
    }
  });

  const vendorOverlaps = {};
  techStack.forEach(tool => {
    const vendor = tool.name.split(' ')[0];
    if (!vendorOverlaps[vendor]) {
      vendorOverlaps[vendor] = [];
    }
    vendorOverlaps[vendor].push(tool);
  });

  Object.entries(vendorOverlaps).forEach(([vendor, tools]) => {
    if (tools.length > 1) {
      const totalCost = tools.reduce((sum, tool) => sum + tool.monthlyCost, 0);
      const estimatedDiscount = totalCost * 0.15;

      overlaps.push({
        category: 'Vendor Consolidation',
        tools: tools.map(t => t.name),
        potentialSavings: estimatedDiscount,
        consolidationComplexity: 'low',
        recommendation: `Negotiate volume discount with ${vendor} for ${tools.length} products`
      });
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

function generateConsolidationPlan(overlaps, savings) {
  const plan = {
    quickWins: [],
    mediumTerm: [],
    strategic: []
  };

  overlaps.forEach(overlap => {
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

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { domain, company } = JSON.parse(event.body || '{}');

    if (!domain || !company) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Domain and company name are required' })
      };
    }

    const cacheKey = generateCacheKey(domain, company);

    const techStack = generateTechStack(domain, company);
    const overlaps = findOverlaps(techStack);
    const savings = calculateSavings(overlaps, techStack);
    const consolidationPlan = generateConsolidationPlan(overlaps, savings);

    const scoreImpact = Math.round(savings.estSavingsPct * 0.5);
    const severity = savings.estSavingsPct >= 20 ? 'high' : savings.estSavingsPct >= 10 ? 'medium' : 'low';

    const signals = [{
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
        `Quick wins: ${consolidationPlan.quickWins.length}`,
        `Top category: ${overlaps[0]?.category || 'None'}`
      ]
    }];

    const response = {
      success: true,
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
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response)
    };

  } catch (error) {
    console.error('SaaS consolidation analysis error:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to analyze SaaS consolidation opportunities',
        message: error.message
      })
    };
  }
};