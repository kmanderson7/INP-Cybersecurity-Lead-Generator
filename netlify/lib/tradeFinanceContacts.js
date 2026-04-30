const HARD_EXCLUDE_KEYWORDS = ['assistant', 'technician', 'analyst', 'intern'];

const CLASSIFICATION_RULES = [
  // ---- Energy / commodity-trading buyer side (existing) ----
  {
    matches: ['cfo', 'chief financial officer'],
    roleCategory: 'decision_maker',
    relevanceScore: 100,
    matchedRole: 'CFO',
    segment: 'energy_traders'
  },
  {
    matches: ['head of trade finance'],
    roleCategory: 'decision_maker',
    relevanceScore: 100,
    matchedRole: 'Head of Trade Finance',
    segment: 'energy_traders'
  },
  {
    matches: ['director of trade finance'],
    roleCategory: 'decision_maker',
    relevanceScore: 98,
    matchedRole: 'Director of Trade Finance',
    segment: 'energy_traders'
  },
  {
    matches: ['treasurer'],
    roleCategory: 'decision_maker',
    relevanceScore: 96,
    matchedRole: 'Treasurer',
    segment: 'energy_traders'
  },
  {
    matches: ['head of treasury'],
    roleCategory: 'decision_maker',
    relevanceScore: 95,
    matchedRole: 'Head of Treasury',
    segment: 'energy_traders'
  },
  {
    matches: ['structured trade finance'],
    roleCategory: 'decision_maker',
    relevanceScore: 94,
    matchedRole: 'Structured Trade Finance',
    segment: 'energy_traders'
  },
  {
    matches: ['trade finance director'],
    roleCategory: 'decision_maker',
    relevanceScore: 92,
    matchedRole: 'Trade Finance Director',
    segment: 'energy_traders'
  },
  {
    matches: ['settlement manager'],
    roleCategory: 'operator',
    relevanceScore: 85,
    matchedRole: 'Settlement Manager',
    segment: 'energy_traders'
  },
  {
    matches: ['trade finance manager'],
    roleCategory: 'operator',
    relevanceScore: 82,
    matchedRole: 'Trade Finance Manager',
    segment: 'energy_traders'
  },
  {
    matches: ['cash management'],
    roleCategory: 'operator',
    relevanceScore: 78,
    matchedRole: 'Cash Management',
    segment: 'energy_traders'
  },
  {
    matches: ['head of payments'],
    roleCategory: 'influencer',
    relevanceScore: 74,
    matchedRole: 'Head of Payments',
    segment: 'energy_traders'
  },
  {
    matches: ['head of risk', 'credit risk'],
    roleCategory: 'influencer',
    relevanceScore: 72,
    matchedRole: 'Head of Risk',
    segment: 'energy_traders'
  },
  {
    matches: ['structured finance lead'],
    roleCategory: 'influencer',
    relevanceScore: 70,
    matchedRole: 'Structured Finance Lead',
    segment: 'energy_traders'
  },
  {
    matches: ['back office operations manager'],
    roleCategory: 'influencer',
    relevanceScore: 68,
    matchedRole: 'Back Office Operations Manager',
    segment: 'energy_traders'
  },
  {
    matches: ['trader'],
    roleCategory: 'low_priority',
    relevanceScore: 50,
    matchedRole: 'Trader',
    segment: 'energy_traders'
  },

  // ---- Bank trade finance / digital assets side (Laminar pilot) ----
  {
    matches: ['head of commodity finance', 'global head of commodity finance', 'head of commodities finance'],
    roleCategory: 'decision_maker',
    relevanceScore: 100,
    matchedRole: 'Head of Commodity Finance',
    segment: 'banks'
  },
  {
    matches: ['head of trade and supply chain finance', 'head of trade & supply chain finance', 'global head of trade and supply chain', 'head of trade & working capital'],
    roleCategory: 'decision_maker',
    relevanceScore: 99,
    matchedRole: 'Head of Trade & Supply Chain Finance',
    segment: 'banks'
  },
  {
    matches: ['head of digital assets', 'head of digital asset', 'head of stablecoin', 'head of crypto and digital assets', 'digital assets lead'],
    roleCategory: 'decision_maker',
    relevanceScore: 98,
    matchedRole: 'Head of Digital Assets',
    segment: 'banks'
  },
  {
    matches: ['head of transaction banking', 'global head of transaction banking'],
    roleCategory: 'decision_maker',
    relevanceScore: 96,
    matchedRole: 'Head of Transaction Banking',
    segment: 'banks'
  },
  {
    matches: ['head of structured commodity finance', 'structured commodity finance lead'],
    roleCategory: 'decision_maker',
    relevanceScore: 95,
    matchedRole: 'Structured Commodity Finance Lead',
    segment: 'banks'
  },
  {
    matches: ['head of trade finance operations', 'trade finance operations manager'],
    roleCategory: 'operator',
    relevanceScore: 84,
    matchedRole: 'Trade Finance Operations',
    segment: 'banks'
  },
  {
    matches: ['rlusd custody', 'digital asset custody', 'stablecoin operations'],
    roleCategory: 'operator',
    relevanceScore: 82,
    matchedRole: 'Digital Asset Custody Ops',
    segment: 'banks'
  },
  {
    matches: ['letter of credit', 'documentary credit'],
    roleCategory: 'operator',
    relevanceScore: 80,
    matchedRole: 'Documentary Credit / LC Operations',
    segment: 'banks'
  },
  {
    matches: ['credit committee', 'commodity credit', 'commodities credit'],
    roleCategory: 'influencer',
    relevanceScore: 74,
    matchedRole: 'Commodity Credit',
    segment: 'banks'
  },

  // ---- Midstream / pipeline / storage operators (Laminar pilot) ----
  {
    matches: ['vp commercial', 'vice president commercial', 'commercial director'],
    roleCategory: 'decision_maker',
    relevanceScore: 92,
    matchedRole: 'Commercial Lead (Midstream)',
    segment: 'midstream'
  },
  {
    matches: ['head of terminals', 'terminals director', 'director of terminals', 'head of storage', 'storage operations director'],
    roleCategory: 'decision_maker',
    relevanceScore: 90,
    matchedRole: 'Head of Terminals / Storage',
    segment: 'midstream'
  },
  {
    matches: ['head of scheduling', 'scheduling manager', 'head of nominations', 'nominations manager'],
    roleCategory: 'operator',
    relevanceScore: 80,
    matchedRole: 'Scheduling / Nominations',
    segment: 'midstream'
  },
  {
    matches: ['terminal operations manager', 'storage operations manager'],
    roleCategory: 'operator',
    relevanceScore: 78,
    matchedRole: 'Terminal Operations',
    segment: 'midstream'
  },

  // ---- Inspection / certification companies (Laminar pilot) ----
  {
    matches: ['head of oil and gas', 'global head of oil & gas', 'oil and gas commercial director'],
    roleCategory: 'decision_maker',
    relevanceScore: 92,
    matchedRole: 'Oil & Gas Commercial Lead (Inspection)',
    segment: 'inspection'
  },
  {
    matches: ['head of inspection', 'inspection services director', 'director of inspection services'],
    roleCategory: 'decision_maker',
    relevanceScore: 90,
    matchedRole: 'Head of Inspection Services',
    segment: 'inspection'
  },
  {
    matches: ['head of digital services', 'digital services director', 'head of innovation'],
    roleCategory: 'influencer',
    relevanceScore: 78,
    matchedRole: 'Digital Services / Innovation',
    segment: 'inspection'
  }
];

export const TRADE_FINANCE_TITLE_INCLUDE_KEYWORDS = [
  // Energy/commodity trader buyer side
  'CFO',
  'Chief Financial Officer',
  'Trade Finance',
  'Treasury',
  'Settlement',
  'Cash Management',
  'Payments',
  'Structured Trade Finance',
  'Structured Finance',
  'Risk',
  'Back Office',
  // Bank side (Laminar pilot)
  'Commodity Finance',
  'Trade & Supply Chain Finance',
  'Trade and Supply Chain Finance',
  'Transaction Banking',
  'Digital Assets',
  'Stablecoin',
  'Documentary Credit',
  'Letter of Credit',
  // Midstream / storage / pipeline
  'Terminals',
  'Storage',
  'Scheduling',
  'Nominations',
  'Commercial Director',
  // Inspection / certification
  'Oil and Gas',
  'Oil & Gas',
  'Inspection',
  'Digital Services'
];

export const TRADE_FINANCE_TITLE_EXCLUDE_KEYWORDS = [
  'Security',
  'Cybersecurity',
  'IT',
  'Infrastructure',
  'DevOps',
  'Assistant',
  'Technician',
  'Analyst',
  'Intern'
];

const CATEGORY_PRIORITY = {
  decision_maker: 0,
  operator: 1,
  influencer: 2,
  low_priority: 3,
  ignore: 4
};

export function normalizeTradeFinanceTitle(title = '') {
  return String(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isTradeFinanceRelevantTitle(title = '') {
  const classification = classifyTradeFinanceRole(title);
  return classification.relevanceScore >= 60 && !classification.hardExcluded;
}

export function classifyTradeFinanceRole(title = '') {
  const normalizedTitle = normalizeTradeFinanceTitle(title);
  const hardExcluded = HARD_EXCLUDE_KEYWORDS.some((keyword) => normalizedTitle.includes(keyword));

  if (!normalizedTitle) {
    return buildClassification('ignore', 0, 'Unclassified', normalizedTitle, hardExcluded);
  }

  for (const rule of CLASSIFICATION_RULES) {
    if (rule.matches.some((match) => normalizedTitle.includes(match))) {
      return buildClassification(
        rule.roleCategory,
        rule.relevanceScore,
        rule.matchedRole,
        normalizedTitle,
        hardExcluded,
        rule.segment
      );
    }
  }

  return buildClassification('ignore', 0, 'Unclassified', normalizedTitle, hardExcluded, null);
}

export function normalizeTradeFinanceContact(person = {}, sourceMeta = {}, companyName) {
  const rawTitle = person.title || person.job_title || '';
  const classification = classifyTradeFinanceRole(rawTitle);
  const normalizedTitle = classification.normalizedTitle || normalizeTradeFinanceTitle(rawTitle) || 'unclassified';

  return {
    name: person.name || [person.first_name, person.last_name].filter(Boolean).join(' ') || 'Unknown Contact',
    title: normalizedTitle,
    company: companyName || person.company || person.organization?.name || person.account?.name || null,
    email: person.email || null,
    seniority: person.seniority || person.seniority_level || null,
    department: person.department || person.organization?.department || null,
    roleCategory: classification.roleCategory,
    relevanceScore: classification.relevanceScore,
    segment: classification.segment || null,
    priorityRank: null,
    sourceMeta: {
      ...sourceMeta,
      titleMatched: classification.matchedRole,
      segment: classification.segment || null,
      originalTitle: rawTitle || null,
      normalizedTitle,
      hardExcluded: classification.hardExcluded
    }
  };
}

export function qualifyTradeFinanceContacts(people = [], sourceMeta = {}, companyName) {
  const normalizedContacts = people
    .map((person) => normalizeTradeFinanceContact(person, sourceMeta, companyName))
    .filter((contact) => contact.relevanceScore >= 60)
    .filter((contact) => !contact.sourceMeta?.hardExcluded);

  const byCategory = {
    decision_maker: [],
    operator: [],
    influencer: []
  };

  for (const contact of normalizedContacts) {
    if (byCategory[contact.roleCategory]) {
      byCategory[contact.roleCategory].push(contact);
    }
  }

  Object.keys(byCategory).forEach((category) => {
    byCategory[category].sort(compareQualifiedContacts);
  });

  const limited = [
    ...byCategory.decision_maker.slice(0, 2),
    ...byCategory.operator.slice(0, 2),
    ...byCategory.influencer.slice(0, 1)
  ]
    .sort(compareQualifiedContacts)
    .slice(0, 5)
    .map((contact, index) => ({
      ...contact,
      priorityRank: index + 1
    }));

  return limited;
}

function buildClassification(roleCategory, relevanceScore, matchedRole, normalizedTitle, hardExcluded, segment = null) {
  return {
    roleCategory: hardExcluded ? 'ignore' : roleCategory,
    relevanceScore: hardExcluded ? 0 : relevanceScore,
    matchedRole,
    normalizedTitle,
    hardExcluded,
    segment: hardExcluded ? null : segment
  };
}

function compareQualifiedContacts(a, b) {
  const categoryDelta = (CATEGORY_PRIORITY[a.roleCategory] ?? 99) - (CATEGORY_PRIORITY[b.roleCategory] ?? 99);
  if (categoryDelta !== 0) {
    return categoryDelta;
  }

  const scoreDelta = (b.relevanceScore || 0) - (a.relevanceScore || 0);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  return (a.name || '').localeCompare(b.name || '');
}
