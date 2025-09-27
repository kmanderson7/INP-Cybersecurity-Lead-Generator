# INP² Cybersecurity Lead Generator v1.5

> AI-powered cybersecurity lead intelligence platform with executive-grade prioritization and automated signal detection.

## 🎯 Overview

The INP² Cybersecurity Lead Generator transforms how cybersecurity service providers identify, prioritize, and engage high-value prospects. Using AI-driven signal detection and executive-grade analytics, it provides the fastest path from intent signal to meeting.

### Key Features

- **🤖 AI-Powered Lead Intelligence**: OpenAI-driven analysis of signals and decision support
- **👑 Executive Dashboard**: Priority-first view with AI-curated insights
- **🎯 Smart Signal Detection**: 12+ signal types including breach proximity, exec moves, compliance deadlines
- **📊 Scoring v2**: Explainable scoring with freshness boost and time decay
- **💼 Decision Cards**: Auto-generated "Why now", "What we'd do first", "Risks of waiting"
- **🔗 Contact Enrichment**: Multi-provider contact discovery with free tier integration
- **📧 AI-Driven Outreach**: Persona-aware messaging with variant generation
- **🌐 Web Scraping**: Ethical, ToS-compliant intelligence gathering

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+
- **npm** or **yarn**
- **Netlify CLI** (for deployment)
- **OpenAI API Key** (required for AI features)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd "B2B lead generation"

# Install dependencies
npm install

# Copy environment template
cp .env.template .env
```

### Environment Setup

Edit `.env` with your API keys:

```bash
# Required for AI functionality
OPENAI_API_KEY=your_openai_api_key_here

# Lead generation (free tiers available)
APOLLO_API_KEY=your_apollo_key_here
NEWSAPI_KEY=your_newsapi_key_here

# Contact enrichment (free credits available)
PEOPLEDATALABS_API_KEY=your_pdl_key_here
HUNTER_API_KEY=your_hunter_key_here
```

**Free Tier Accounts Available:**
- **OpenAI**: $5 credit for new accounts
- **Apollo**: Free plan with limited credits
- **NewsAPI**: 1000 requests/day free
- **People Data Labs**: 100 enrichments/month free
- **Hunter.io**: 50 searches/month free

### Development

```bash
# Start development server
npm run dev

# Start Netlify functions locally
netlify dev

# Build for production
npm run build
```

## 🏗️ Architecture

### Frontend (React + Vite)
- **Executive Dashboard**: AI-prioritized lead queue
- **Detailed View**: Traditional list with company details
- **Signal Integration**: Real-time intelligence overlay
- **Responsive Design**: Desktop-optimized with mobile support

### Backend (Netlify Functions)
```
netlify/functions/
├── aggregate-signals.js    # AI analysis orchestrator
├── fetch-leads.js         # Lead generation
├── exec-moves.js          # Executive change detection
├── breach-proximity.js    # Security incident proximity
├── reg-countdown.js       # Compliance deadline tracking
├── surface-regression.js  # Attack surface changes
├── ai-governance-gap.js   # AI usage vs governance analysis
├── rfp-hunter.js          # Security RFP detection
└── lib/                   # Shared utilities
    ├── http.js            # HTTP with retries/timeouts
    ├── cache.js           # In-memory caching
    ├── rateLimit.js       # Rate limiting
    └── normalize.js       # Data normalization
```

## 🎛️ API Endpoints

### Core Functions

#### `POST /.netlify/functions/aggregate-signals`
AI-powered signal analysis and decision support.
```javascript
{
  "domain": "company.com",
  "company": "Company Name",
  "industry": "Software",
  "signals": [/* signal objects */]
}
```

Returns:
```javascript
{
  "success": true,
  "analysis": {
    "executiveSummary": "AI-generated summary",
    "urgencyScore": 85,
    "decisionCards": {
      "whyNow": ["reason1", "reason2"],
      "firstMoves": ["action1", "action2"],
      "risksOfWaiting": ["risk1", "risk2"]
    },
    "aiInsights": { /* strategic insights */ }
  }
}
```

#### Signal Detection Functions

| Function | Purpose | Impact Score |
|----------|---------|--------------|
| `exec-moves` | Leadership changes | +35-45 |
| `breach-proximity` | Security incidents | +15-50 |
| `reg-countdown` | Compliance deadlines | +15-35 |
| `surface-regression` | Attack surface changes | +5-20 |
| `ai-governance-gap` | AI usage vs governance | +15-25 |
| `rfp-hunter` | Security procurement | +25-40 |

### Error Handling

All functions return consistent error responses:
```javascript
{
  "success": false,
  "error": "Error description"
}
```

Rate limits: 20-50 requests/hour per IP depending on function complexity.

## 📱 Usage Guide

### Executive Dashboard

1. **Switch to Executive View**: Click "Executive" in the header toggle
2. **Generate Leads**: Use "Apollo API" or "Security News" buttons
3. **AI Analysis**: Automatic signal detection and prioritization
4. **Lead Selection**: Click any lead card for detailed analysis

### Lead Intelligence Workflow

1. **Signal Detection**: Automated scanning of 6+ signal types
2. **AI Aggregation**: OpenAI analysis combines signals into business insights
3. **Executive Scoring**: Priority calculation with explainability
4. **Decision Support**: Auto-generated strategic talking points
5. **Contact Enrichment**: Multi-source contact discovery
6. **Outreach Generation**: AI-crafted, persona-specific messaging

### Data Flow

```
Lead Generation → Signal Detection → AI Analysis → Executive Dashboard
     ↓                    ↓              ↓             ↓
  Raw Leads          Structured      Business      Prioritized
                     Signals         Insights      Opportunities
```

## 🔧 Configuration

### Netlify Deployment

1. **Connect Repository**: Link GitHub repo to Netlify
2. **Build Settings**:
   ```
   Build command: npm run build
   Publish directory: dist
   Functions directory: netlify/functions
   ```
3. **Environment Variables**: Add all keys from `.env.template`
4. **Deploy**: Automatic on git push

### Environment Variables

Required:
- `OPENAI_API_KEY`: For AI analysis
- `NEWSAPI_KEY`: For security news monitoring

Optional (graceful degradation):
- `APOLLO_API_KEY`: Enhanced lead generation
- `PEOPLEDATALABS_API_KEY`: Contact enrichment
- `HUNTER_API_KEY`: Email discovery

### Rate Limiting

Built-in rate limiting by IP:
- AI functions: 20/hour
- Signal functions: 25-40/hour
- General functions: 50/hour

### Caching

Automatic caching with TTL:
- Signal data: 6-24 hours
- AI analysis: 4-6 hours
- Lead data: 1 hour

## 🧪 Testing

### Development Testing
```bash
# Test build
npm run build

# Test functions locally
netlify dev

# Lint code
npm run lint
```

### Production Testing
```bash
# Deploy to Netlify
netlify deploy --prod

# Test API endpoints
curl -X POST https://yoursite.netlify.app/.netlify/functions/aggregate-signals \\
  -H "Content-Type: application/json" \\
  -d '{"domain":"example.com","company":"Test Co","industry":"Software"}'
```

## 🔒 Security & Privacy

### Data Handling
- **No PII Storage**: Only business contact information
- **Aggregate Data**: Dark web exposure shows levels only, no leaked data
- **API Keys**: Server-side only, never exposed to client
- **Rate Limiting**: Prevents abuse and reduces costs

### Compliance
- **Robots.txt Compliance**: Web scraping respects robots.txt
- **ToS Adherence**: Uses official APIs where possible
- **GDPR Readiness**: Delete lead functionality available
- **Evidence Tracking**: All signals include source URLs

### Web Scraping Ethics
- **Polite Crawling**: 5-second timeouts, retry logic
- **Public Data Only**: No login-protected content
- **API Preference**: Uses official APIs when available
- **User Agent**: Identifies as legitimate business tool

## 📊 Monitoring

### Function Logs
View in Netlify dashboard under Functions → [Function Name] → Logs

### Error Tracking
```javascript
// Custom error logging
console.error('Function error:', {
  function: 'aggregate-signals',
  domain: domain,
  error: error.message
});
```

### Performance Metrics
- **Cold Start**: ~2-3s for AI functions
- **Warm Start**: ~200-500ms for cached responses
- **Cache Hit Rate**: ~60-80% for repeat queries

## 🚀 Deployment Checklist

- [ ] Environment variables configured in Netlify
- [ ] OpenAI API key added and tested
- [ ] Build succeeds without errors
- [ ] Functions deploy successfully
- [ ] Rate limiting works correctly
- [ ] Cache TTL configured appropriately
- [ ] Error handling tested
- [ ] Executive dashboard loads properly
- [ ] AI analysis generates insights
- [ ] Contact enrichment functions
- [ ] Web scraping respects robots.txt

## 🛠️ Troubleshooting

### Common Issues

**Build Failures:**
```bash
# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

**Function Errors:**
- Check Netlify function logs
- Verify environment variables
- Test locally with `netlify dev`

**AI Analysis Not Working:**
- Verify OPENAI_API_KEY is set
- Check OpenAI account has sufficient credits
- Review function logs for API errors

**Rate Limiting Issues:**
- Implement exponential backoff
- Cache responses appropriately
- Consider upgrading API plans

### Support Resources

- **Netlify Docs**: https://docs.netlify.com
- **OpenAI API**: https://platform.openai.com/docs
- **Function Logs**: Netlify Dashboard → Functions
- **Build Logs**: Netlify Dashboard → Deploys

## 📈 Roadmap

### v1.6 (Planned)
- [ ] Advanced signal functions (dw-exposure, board-heatmap)
- [ ] 3-touch email sequencing
- [ ] Saved segments with fast switching
- [ ] Kanban pipeline view
- [ ] Real-time contact enrichment

### v2.0 (Future)
- [ ] Multi-tenant authentication
- [ ] CRM bi-directional sync
- [ ] Advanced email automation
- [ ] Team collaboration features
- [ ] Custom signal types

## 📄 License

Proprietary - INP² Security Solutions

## 🤝 Contributing

Internal development team only. For questions or issues:
- Create issue in repository
- Contact development team
- Review architecture documentation

---

**Built with ❤️ by the INP² Security team**