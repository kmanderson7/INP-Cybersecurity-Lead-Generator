const HARD_EXCLUDE_KEYWORDS = ['assistant', 'technician', 'analyst', 'intern'];

const CLASSIFICATION_RULES = [
  {
    matches: ['cfo', 'chief financial officer'],
    roleCategory: 'decision_maker',
    relevanceScore: 100,
    matchedRole: 'CFO'
  },
  {
    matches: ['head of trade finance'],
    roleCategory: 'decision_maker',
    relevanceScore: 100,
    matchedRole: 'Head of Trade Finance'
  },
  {
    matches: ['director of trade finance'],
    roleCategory: 'decision_maker',
    relevanceScore: 98,
    matchedRole: 'Director of Trade Finance'
  },
  {
    matches: ['treasurer'],
    roleCategory: 'decision_maker',
    relevanceScore: 96,
    matchedRole: 'Treasurer'
  },
  {
    matches: ['head of treasury'],
    roleCategory: 'decision_maker',
    relevanceScore: 95,
    matchedRole: 'Head of Treasury'
  },
  {
    matches: ['structured trade finance'],
    roleCategory: 'decision_maker',
    relevanceScore: 94,
    matchedRole: 'Structured Trade Finance'
  },
  {
    matches: ['trade finance director'],
    roleCategory: 'decision_maker',
    relevanceScore: 92,
    matchedRole: 'Trade Finance Director'
  },
  {
    matches: ['settlement manager'],
    roleCategory: 'operator',
    relevanceScore: 85,
    matchedRole: 'Settlement Manager'
  },
  {
    matches: ['trade finance manager'],
    roleCategory: 'operator',
    relevanceScore: 82,
    matchedRole: 'Trade Finance Manager'
  },
  {
    matches: ['cash management'],
    roleCategory: 'operator',
    relevanceScore: 78,
    matchedRole: 'Cash Management'
  },
  {
    matches: ['head of payments'],
    roleCategory: 'influencer',
    relevanceScore: 74,
    matchedRole: 'Head of Payments'
  },
  {
    matches: ['head of risk', 'credit risk'],
    roleCategory: 'influencer',
    relevanceScore: 72,
    matchedRole: 'Head of Risk'
  },
  {
    matches: ['structured finance lead'],
    roleCategory: 'influencer',
    relevanceScore: 70,
    matchedRole: 'Structured Finance Lead'
  },
  {
    matches: ['back office operations manager'],
    roleCategory: 'influencer',
    relevanceScore: 68,
    matchedRole: 'Back Office Operations Manager'
  },
  {
    matches: ['trader'],
    roleCategory: 'low_priority',
    relevanceScore: 50,
    matchedRole: 'Trader'
  }
];

export const TRADE_FINANCE_TITLE_INCLUDE_KEYWORDS = [
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
  'Back Office'
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
        hardExcluded
      );
    }
  }

  return buildClassification('ignore', 0, 'Unclassified', normalizedTitle, hardExcluded);
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
    priorityRank: null,
    sourceMeta: {
      ...sourceMeta,
      titleMatched: classification.matchedRole,
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

function buildClassification(roleCategory, relevanceScore, matchedRole, normalizedTitle, hardExcluded) {
  return {
    roleCategory: hardExcluded ? 'ignore' : roleCategory,
    relevanceScore: hardExcluded ? 0 : relevanceScore,
    matchedRole,
    normalizedTitle,
    hardExcluded
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
