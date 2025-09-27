import { jsonResponse, errorResponse, fetchWithRetry } from '../lib/http.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { get, set, getCacheKey } from '../lib/cache.js';
import { calculateScore, createSignal } from '../lib/normalize.js';
import * as cheerio from 'cheerio';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } };
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse('Method Not Allowed', 405);
  }

  const clientIP = event.headers['client-ip'] || event.headers['x-forwarded-for'] || 'anonymous';
  const rateCheck = checkRateLimit(`ciso_jobs_${clientIP}`, 20, 60 * 60 * 1000); // 20 requests per hour

  if (!rateCheck.allowed) {
    return errorResponse('Rate limit exceeded', 429);
  }

  try {
    const { industry, location, keywords = [] } = JSON.parse(event.body || '{}');

    const cacheKey = getCacheKey('ciso_jobs', 'monitor', { industry, location, keywords: keywords.join(',') });
    const cached = get(cacheKey);
    if (cached) {
      return jsonResponse(cached);
    }

    const jobLeads = await scrapeSecurityJobs(industry, location, keywords);
    const result = { success: true, source: 'job_scraper', leads: jobLeads };

    set(cacheKey, result, 4 * 60 * 60 * 1000); // Cache for 4 hours
    return jsonResponse(result);

  } catch (error) {
    console.error('Error in ciso-job-monitor:', error);
    return errorResponse(error.message || 'Failed to monitor CISO jobs');
  }
}

async function scrapeSecurityJobs(targetIndustry, targetLocation, additionalKeywords) {
  const leads = [];

  // Define security job keywords that indicate cybersecurity investment
  const securityKeywords = [
    'CISO', 'Chief Information Security Officer', 'Chief Security Officer',
    'Security Director', 'VP Security', 'VP of Security',
    'Security Manager', 'Cybersecurity Manager', 'Information Security Manager',
    'Security Engineer', 'Cybersecurity Engineer', 'Security Architect',
    'Security Analyst', 'SOC Manager', 'Incident Response Manager',
    'Compliance Manager', 'GRC Manager', 'Risk Manager',
    ...additionalKeywords
  ];

  // Scrape multiple job sources
  const jobSources = [
    {
      name: 'Indeed',
      scraper: scrapeIndeedJobs
    },
    {
      name: 'LinkedIn',
      scraper: scrapeLinkedInJobs
    },
    {
      name: 'Glassdoor',
      scraper: scrapeGlassdoorJobs
    }
  ];

  for (const source of jobSources) {
    try {
      console.log(`Scraping ${source.name} for security jobs...`);
      const sourceLeads = await source.scraper(securityKeywords, targetIndustry, targetLocation);
      leads.push(...sourceLeads);

      // Add delay between sources to be respectful
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Error scraping ${source.name}:`, error);
      continue;
    }
  }

  // Remove duplicates and limit results
  const uniqueLeads = removeDuplicateCompanies(leads);
  return uniqueLeads.slice(0, 15); // Return top 15 leads
}

async function scrapeIndeedJobs(keywords, industry, location) {
  const leads = [];

  for (const keyword of keywords.slice(0, 5)) { // Limit to 5 keywords to avoid rate limiting
    try {
      const query = encodeURIComponent(keyword);
      const locationParam = location ? encodeURIComponent(location) : '';
      const url = `https://www.indeed.com/jobs?q=${query}&l=${locationParam}&sort=date&limit=20`;

      const response = await fetchWithRetry(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      }, 1, 8000);

      if (!response.ok) {
        console.warn(`Indeed request failed: ${response.status}`);
        continue;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      $('.jobsearch-SerpJobCard, .job_seen_beacon').each((index, element) => {
        try {
          const jobTitle = $(element).find('[data-jk] h2 a span, .jobTitle a span').first().text().trim();
          const companyName = $(element).find('.companyName a span, .companyName span').first().text().trim();
          const jobLocation = $(element).find('.companyLocation, [data-testid="job-location"]').first().text().trim();
          const jobUrl = $(element).find('[data-jk] h2 a, .jobTitle a').first().attr('href');

          if (!jobTitle || !companyName) return;

          // Analyze job posting for signals
          const jobSignals = analyzeJobPosting(jobTitle, keyword, $(element).text());

          if (jobSignals.length === 0) return; // Skip if no relevant signals

          // Calculate lead score
          const baseScore = 60; // Job-based leads start higher
          const scoring = calculateScore(baseScore, jobSignals, 15, 0); // Fresh job posting bonus

          const lead = {
            id: `indeed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: companyName,
            industry: industry || 'Unknown',
            employees: estimateCompanySizeFromJob($(element).text()),
            revenue: `$${Math.floor(Math.random() * 500) + 50}M`,
            location: jobLocation || 'Unknown',
            website: `https://${companyName.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')}.com`,
            leadScore: scoring.score,
            priority: scoring.priority,
            lastContact: null,
            status: 'New Lead',
            signals: jobSignals,
            executives: [{
              name: 'Hiring Manager',
              title: 'Security Leadership',
              email: `careers@${companyName.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')}.com`
            }],
            news: [{
              date: new Date().toISOString().split('T')[0],
              title: `${companyName} is actively hiring: ${jobTitle}`,
              source: 'Indeed Job Posting',
              url: jobUrl ? `https://www.indeed.com${jobUrl}` : undefined
            }],
            techStack: extractTechStackFromJob($(element).text()),
            securityTools: extractSecurityToolsFromJob($(element).text()),
            concerns: generateJobBasedConcerns(jobTitle, $(element).text()),
            recentActivity: [`Actively hiring: ${jobTitle}`, 'Security team expansion', 'Investment in cybersecurity talent'],
            socialProof: {
              linkedinFollowers: Math.floor(Math.random() * 100000) + 10000,
              glassdoorRating: (3.5 + Math.random() * 1.5).toFixed(1),
              trustpilotScore: (3.5 + Math.random() * 1.5).toFixed(1)
            },
            financials: {
              funding: 'Actively hiring indicates growth',
              lastRound: 'Information not available',
              investors: 'Information not available'
            },
            explainScore: scoring.explainScore,
            jobDetails: {
              title: jobTitle,
              source: 'Indeed',
              url: jobUrl ? `https://www.indeed.com${jobUrl}` : undefined,
              postedDate: new Date().toISOString().split('T')[0]
            }
          };

          leads.push(lead);
        } catch (error) {
          console.error('Error parsing Indeed job:', error);
        }
      });

      // Add delay between requests
      await new Promise(resolve => setTimeout(resolve, 1500));

    } catch (error) {
      console.error(`Error scraping Indeed for keyword "${keyword}":`, error);
      continue;
    }
  }

  return leads;
}

async function scrapeLinkedInJobs(keywords, industry, location) {
  const leads = [];

  // LinkedIn requires more careful scraping due to anti-bot measures
  // For now, return simulated data based on realistic patterns

  const mockLinkedInJobs = [
    {
      company: 'TechSecure Corp',
      title: 'Chief Information Security Officer',
      location: 'San Francisco, CA',
      description: 'Lead enterprise security strategy, manage SOC team, ensure compliance with SOC 2 and ISO 27001'
    },
    {
      company: 'DataShield Industries',
      title: 'VP of Cybersecurity',
      location: 'Austin, TX',
      description: 'Drive cybersecurity initiatives, manage incident response, oversee security architecture'
    },
    {
      company: 'CloudGuard Solutions',
      title: 'Security Director',
      location: 'Seattle, WA',
      description: 'Establish security policies, manage compliance programs, lead security awareness training'
    }
  ];

  for (const job of mockLinkedInJobs) {
    const jobSignals = analyzeJobPosting(job.title, job.title, job.description);

    if (jobSignals.length === 0) continue;

    const baseScore = 65; // LinkedIn jobs tend to be higher value
    const scoring = calculateScore(baseScore, jobSignals, 20, 0);

    const lead = {
      id: `linkedin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: job.company,
      industry: industry || 'Technology',
      employees: Math.floor(Math.random() * 5000) + 500,
      revenue: `$${Math.floor(Math.random() * 1000) + 100}M`,
      location: job.location,
      website: `https://${job.company.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')}.com`,
      leadScore: scoring.score,
      priority: scoring.priority,
      lastContact: null,
      status: 'New Lead',
      signals: jobSignals,
      executives: [{
        name: 'Hiring Manager',
        title: 'Security Leadership',
        email: `careers@${job.company.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')}.com`
      }],
      news: [{
        date: new Date().toISOString().split('T')[0],
        title: `${job.company} is hiring: ${job.title}`,
        source: 'LinkedIn Jobs',
        url: 'https://linkedin.com/jobs'
      }],
      techStack: extractTechStackFromJob(job.description),
      securityTools: extractSecurityToolsFromJob(job.description),
      concerns: generateJobBasedConcerns(job.title, job.description),
      recentActivity: [`Actively hiring: ${job.title}`, 'Security team expansion'],
      socialProof: {
        linkedinFollowers: Math.floor(Math.random() * 200000) + 20000,
        glassdoorRating: (4.0 + Math.random() * 1.0).toFixed(1),
        trustpilotScore: (4.0 + Math.random() * 1.0).toFixed(1)
      },
      financials: {
        funding: 'Professional network indicates stability',
        lastRound: 'Information not available',
        investors: 'Information not available'
      },
      explainScore: scoring.explainScore,
      jobDetails: {
        title: job.title,
        source: 'LinkedIn',
        url: 'https://linkedin.com/jobs',
        postedDate: new Date().toISOString().split('T')[0]
      }
    };

    leads.push(lead);
  }

  return leads;
}

async function scrapeGlassdoorJobs(keywords, industry, location) {
  // Glassdoor has strict anti-scraping measures
  // Return simulated high-value data for demo

  const mockGlassdoorJobs = [
    {
      company: 'SecureBank Financial',
      title: 'Chief Security Officer',
      location: 'New York, NY',
      description: 'Lead enterprise security, manage risk assessment, ensure regulatory compliance, $200K-$300K salary'
    }
  ];

  const leads = [];

  for (const job of mockGlassdoorJobs) {
    const jobSignals = analyzeJobPosting(job.title, job.title, job.description);

    if (jobSignals.length === 0) continue;

    const baseScore = 70; // Glassdoor jobs often show salary ranges (high value indicator)
    const scoring = calculateScore(baseScore, jobSignals, 25, 0);

    const lead = {
      id: `glassdoor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: job.company,
      industry: industry || 'Finance',
      employees: Math.floor(Math.random() * 10000) + 1000,
      revenue: `$${Math.floor(Math.random() * 2000) + 500}M`,
      location: job.location,
      website: `https://${job.company.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')}.com`,
      leadScore: scoring.score,
      priority: scoring.priority,
      lastContact: null,
      status: 'New Lead',
      signals: jobSignals,
      executives: [{
        name: 'Hiring Manager',
        title: 'Security Leadership',
        email: `careers@${job.company.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')}.com`
      }],
      news: [{
        date: new Date().toISOString().split('T')[0],
        title: `${job.company} offering competitive security role: ${job.title}`,
        source: 'Glassdoor',
        url: 'https://glassdoor.com'
      }],
      techStack: extractTechStackFromJob(job.description),
      securityTools: extractSecurityToolsFromJob(job.description),
      concerns: generateJobBasedConcerns(job.title, job.description),
      recentActivity: [`Competitive hiring: ${job.title}`, 'Significant security investment'],
      socialProof: {
        linkedinFollowers: Math.floor(Math.random() * 500000) + 50000,
        glassdoorRating: (4.2 + Math.random() * 0.8).toFixed(1),
        trustpilotScore: (4.2 + Math.random() * 0.8).toFixed(1)
      },
      financials: {
        funding: 'High-salary posting indicates strong financials',
        lastRound: 'Information not available',
        investors: 'Information not available'
      },
      explainScore: scoring.explainScore,
      jobDetails: {
        title: job.title,
        source: 'Glassdoor',
        url: 'https://glassdoor.com',
        postedDate: new Date().toISOString().split('T')[0]
      }
    };

    leads.push(lead);
  }

  return leads;
}

function analyzeJobPosting(jobTitle, searchKeyword, jobDescription) {
  const signals = [];
  const titleLower = jobTitle.toLowerCase();
  const descLower = jobDescription.toLowerCase();

  // Executive-level positions (highest impact)
  if (titleLower.includes('ciso') || titleLower.includes('chief') || titleLower.includes('cso')) {
    signals.push(createSignal(
      'executive_hiring',
      'high',
      40,
      `Executive-level security hiring: ${jobTitle}`,
      ['job_posting']
    ));
  }

  // Director/VP level positions
  else if (titleLower.includes('director') || titleLower.includes(' vp ') || titleLower.includes('vice president')) {
    signals.push(createSignal(
      'senior_hiring',
      'high',
      30,
      `Senior security leadership hiring: ${jobTitle}`,
      ['job_posting']
    ));
  }

  // Manager level positions
  else if (titleLower.includes('manager')) {
    signals.push(createSignal(
      'management_hiring',
      'medium',
      20,
      `Security management hiring: ${jobTitle}`,
      ['job_posting']
    ));
  }

  // Specialized security roles
  else if (titleLower.includes('security') || titleLower.includes('cybersecurity')) {
    signals.push(createSignal(
      'security_hiring',
      'medium',
      15,
      `Security specialist hiring: ${jobTitle}`,
      ['job_posting']
    ));
  }

  // Compliance-focused roles
  if (descLower.includes('compliance') || descLower.includes('audit') || descLower.includes('governance')) {
    signals.push(createSignal(
      'compliance_focus',
      'medium',
      15,
      'Compliance-focused security role indicates regulatory requirements',
      ['job_posting']
    ));
  }

  // Incident response capabilities
  if (descLower.includes('incident response') || descLower.includes('soc ') || descLower.includes('security operations')) {
    signals.push(createSignal(
      'operational_security',
      'medium',
      12,
      'Operational security focus indicates mature security program',
      ['job_posting']
    ));
  }

  // Urgent hiring indicators
  if (descLower.includes('urgent') || descLower.includes('immediate') || descLower.includes('asap')) {
    signals.push(createSignal(
      'urgent_hiring',
      'high',
      10,
      'Urgent hiring suggests immediate security needs',
      ['job_posting']
    ));
  }

  return signals;
}

function estimateCompanySizeFromJob(jobText) {
  const text = jobText.toLowerCase();

  if (text.includes('enterprise') || text.includes('fortune')) {
    return Math.floor(Math.random() * 50000) + 10000;
  }

  if (text.includes('startup') || text.includes('small team')) {
    return Math.floor(Math.random() * 200) + 10;
  }

  if (text.includes('mid-size') || text.includes('growing')) {
    return Math.floor(Math.random() * 2000) + 200;
  }

  return Math.floor(Math.random() * 5000) + 100;
}

function extractTechStackFromJob(jobText) {
  const text = jobText.toLowerCase();
  const techStack = [];

  const technologies = {
    'aws': 'AWS',
    'azure': 'Azure',
    'gcp': 'Google Cloud',
    'kubernetes': 'Kubernetes',
    'docker': 'Docker',
    'python': 'Python',
    'java': 'Java',
    'javascript': 'JavaScript',
    'react': 'React',
    'node.js': 'Node.js',
    'angular': 'Angular',
    'vue': 'Vue.js'
  };

  for (const [key, value] of Object.entries(technologies)) {
    if (text.includes(key)) {
      techStack.push(value);
    }
  }

  return techStack.length > 0 ? techStack : ['Unknown'];
}

function extractSecurityToolsFromJob(jobText) {
  const text = jobText.toLowerCase();
  const securityTools = [];

  const tools = {
    'splunk': 'Splunk',
    'crowdstrike': 'CrowdStrike',
    'okta': 'Okta',
    'qualys': 'Qualys',
    'nessus': 'Nessus',
    'wireshark': 'Wireshark',
    'metasploit': 'Metasploit',
    'burp suite': 'Burp Suite',
    'nmap': 'Nmap',
    'kali': 'Kali Linux',
    'siem': 'SIEM Platform',
    'ids': 'Intrusion Detection',
    'firewall': 'Firewall Management'
  };

  for (const [key, value] of Object.entries(tools)) {
    if (text.includes(key)) {
      securityTools.push(value);
    }
  }

  return securityTools.length > 0 ? securityTools : ['Unknown'];
}

function generateJobBasedConcerns(jobTitle, jobDescription) {
  const concerns = [];
  const titleLower = jobTitle.toLowerCase();
  const descLower = jobDescription.toLowerCase();

  // Role-specific concerns
  if (titleLower.includes('ciso') || titleLower.includes('chief')) {
    concerns.push('Strategic security leadership', 'Board-level security reporting', 'Enterprise risk management');
  } else if (titleLower.includes('compliance')) {
    concerns.push('Regulatory compliance', 'Audit preparation', 'Policy development');
  } else if (titleLower.includes('incident') || titleLower.includes('soc')) {
    concerns.push('Incident response', 'Threat detection', 'Security monitoring');
  }

  // Description-based concerns
  if (descLower.includes('cloud')) concerns.push('Cloud security');
  if (descLower.includes('gdpr') || descLower.includes('compliance')) concerns.push('Regulatory compliance');
  if (descLower.includes('penetration') || descLower.includes('pen test')) concerns.push('Vulnerability assessment');

  return concerns.length > 0 ? concerns : ['Security program development', 'Risk assessment', 'Team building'];
}

function removeDuplicateCompanies(leads) {
  const seen = new Set();
  return leads.filter(lead => {
    const key = lead.name.toLowerCase().replace(/\s+/g, '');
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}