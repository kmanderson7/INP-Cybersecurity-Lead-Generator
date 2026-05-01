import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  decorateLeadWithMeta,
  getSourceBadge,
  getSourceWarning,
  isNonLiveMeta,
  normalizeApiPayload
} from '@/lib/sourceMeta';
import { loadLeadState, saveLeadState } from '@/lib/storage/leadStore';
import { loadSegmentState, saveSegmentState } from '@/lib/storage/segmentStore';
import { loadSequenceState, saveSequenceState } from '@/lib/storage/sequenceStore';
import { loadOutreachState, saveOutreachState } from '@/lib/storage/outreachStore';
import { loadLaminarState, saveLaminarState } from '@/lib/storage/laminarStore';
import { qualifyTradeFinanceContacts } from '../../netlify/lib/tradeFinanceContacts.js';
import {
  LAMINAR_PILOT_PROFILE,
  LAMINAR_SEGMENTS,
  LAMINAR_SEGMENT_ORDER,
  getAllLaminarTitles,
  getAllLaminarDomains,
  inferContactSegment
} from '../../netlify/lib/laminarPilot.js';
import ExecutiveDashboard from './ExecutiveDashboard';
import CalendarScheduler from './CalendarScheduler';
import BulkEmail from './BulkEmail';
import Analytics from './Analytics';
import LaminarDecisionCards from './LaminarDecisionCards';
import LaminarOutreachGenerator from './LaminarOutreachGenerator';
import {
  Search, Star, TrendingUp, Mail, Phone, Globe, AlertCircle, Shield,
  DollarSign, Users, Calendar, Filter, Loader2, Crown, List, AlertTriangle,
  Clock, Brain, Target, Eye, Save, CheckCircle2, Briefcase,
  Plus, Flame, RefreshCw
} from 'lucide-react';
import {
  computeContactHeat,
  computeSegmentMetrics,
  getTopSignalForSegment,
  sortContactsBy,
  getCompanyWorkingCapital,
  formatCurrencyShort,
  inferPillarReadiness,
  SEGMENT_ICONS
} from '@/lib/laminarMetrics';

/* ---------------- Error Boundary Component ---------------- */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Dashboard Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Something went wrong</h2>
          <p className="text-red-600 mb-4">The dashboard encountered an error. Please refresh the page.</p>
          <Button onClick={() => window.location.reload()} className="bg-red-600 hover:bg-red-700">
            Refresh Page
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

/* ---------------- Netlify Functions client (pure JS) ---------------- */
const netlifyAPI = {
  async _postJSON(path, body, opts = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000);

    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
        signal: controller.signal,
      });

      const text = await res.text();
      let data;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

      if (!res.ok) {
        const msg = data?.error || data?.message || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return normalizeApiPayload(data);
    } finally {
      clearTimeout(id);
    }
  },

  async fetchLeads(criteria) {
    return this._postJSON('/.netlify/functions/fetch-leads', criteria);
  },

  async fetchNewsLeads(criteria) {
    // must match your function name (news-leads)
    return this._postJSON('/.netlify/functions/news-leads', criteria);
  },

  async apolloCompanySearch(keywords, opts = {}) {
    return this._postJSON('/.netlify/functions/apollo-company-search', {
      keywords,
      page: opts.page ?? 1,
      perPage: opts.perPage ?? 25,
      scoringProfile: opts.scoringProfile ?? 'commodity_trading',
    });
  },

  async apolloPeopleSearch(titles, domains = [], opts = {}) {
    return this._postJSON('/.netlify/functions/apollo-people-search', {
      titles,
      domains,
      page: opts.page ?? 1,
      perPage: opts.perPage ?? 25,
      scoringProfile: opts.scoringProfile ?? 'commodity_trading',
    });
  },

  async apolloPersonEnrich(params = {}) {
    return this._postJSON('/.netlify/functions/apollo-person-enrich', {
      firstName: params.firstName,
      lastName: params.lastName,
      organizationName: params.organizationName,
      linkedinUrl: params.linkedinUrl,
      email: params.email,
      scoringProfile: params.scoringProfile ?? 'commodity_trading',
    });
  },

  async laminarAI(feature, payload) {
    return this._postJSON('/.netlify/functions/laminar-ai', { feature, payload });
  },

  async analyzeTech(domain) {
    return this._postJSON('/.netlify/functions/enrich-company', { domain });
  },

  async enrichCompany(domain) {
    return this.analyzeTech(domain);
  },

  async aggregateSignals(domain, company, industry, signals = []) {
    return this._postJSON('/.netlify/functions/aggregate-signals', {
      domain, company, industry, signals
    });
  },

  async getExecutiveMove(domain, company) {
    return this._postJSON('/.netlify/functions/exec-moves', { domain, company });
  },

  async getBreachProximity(domain, industry) {
    return this._postJSON('/.netlify/functions/breach-proximity', { domain, industry });
  },

  async getRegulatoryCountdown(domain, industry) {
    return this._postJSON('/.netlify/functions/reg-countdown', { domain, industry });
  },

  async getSurfaceRegression(domain) {
    return this._postJSON('/.netlify/functions/surface-regression', { domain });
  },

  async getInsuranceRenewal(domain, industry, existingControls = []) {
    return this._postJSON('/.netlify/functions/ins-renewal', { domain, industry, existingControls });
  },

  async getWorkforceStress(domain, company) {
    return this._postJSON('/.netlify/functions/workforce-stress', { domain, company });
  },

  async getBoardHeatmap(domain, company) {
    return this._postJSON('/.netlify/functions/board-heatmap', { domain, company });
  },

  async getDarkWebExposure(domain) {
    return this._postJSON('/.netlify/functions/dw-exposure', { domain });
  },

  async getConferenceIntent(conference = 'RSA', year = new Date().getFullYear(), company) {
    return this._postJSON('/.netlify/functions/conf-intent', { conference, year, company });
  },

  async getSaasConsolidation(domain, company) {
    return this._postJSON('/.netlify/functions/saas-consolidation', { domain, company });
  },

  async sendEmail(to, subject, body, leadId, persona = 'CFO', tone = 'professional') {
    return this._postJSON('/.netlify/functions/send-email', {
      to, subject, body, leadId, persona, tone
    });
  },

  async scheduleCall(leadId, contactInfo, timeSlot) {
    return this._postJSON('/.netlify/functions/schedule-call', {
      leadId, contactInfo, timeSlot
    });
  },

  async getIntegrationHealth() {
    const res = await fetch('/.netlify/functions/integration-health');
    const text = await res.text();
    const payload = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw new Error(payload?.error || `HTTP ${res.status}`);
    }
    return normalizeApiPayload(payload);
  }
};

const flattenOutreachHistory = (companies = []) =>
  companies.flatMap((company) =>
    (company.outreachHistory || []).map((entry) => ({
      ...entry,
      companyId: company.id,
      companyName: company.name
    }))
  );

const EnhancedLeadGenDashboard = () => {
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterIndustry, setFilterIndustry] = useState('all');
  const [showLeadGen, setShowLeadGen] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);
  const [currentView, setCurrentView] = useState('executive'); // executive, detailed, kanban
  const [filterState, setFilterState] = useState('all'); // State filtering
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Email and communication state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [showBulkEmailModal, setShowBulkEmailModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [emailData, setEmailData] = useState({
    to: '',
    subject: '',
    body: '',
    persona: 'CFO',
    tone: 'professional'
  });
  const [emailSending, setEmailSending] = useState(false);
  const [lastEmailResult, setLastEmailResult] = useState(null);

  // separate loading flags (no cross-locking)
  const [loadingApollo, setLoadingApollo] = useState(false);
  const [loadingNews, setLoadingNews] = useState(false);
  const [healthLoading, setHealthLoading] = useState(false);
  const [integrationHealth, setIntegrationHealth] = useState([]);
  const [storageHydrated, setStorageHydrated] = useState(false);

  // Tech Analysis
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);

  // Apollo Prospector (keyword company search, title-based people search, person enrichment)
  const [apolloProfile, setApolloProfile] = useState('commodity_trading');
  const [apolloKeywordsInput, setApolloKeywordsInput] = useState('');
  const [apolloTitlesInput, setApolloTitlesInput] = useState('');
  const [apolloDomainsInput, setApolloDomainsInput] = useState('');
  const [apolloEnrichInput, setApolloEnrichInput] = useState({
    firstName: '', lastName: '', organizationName: '', linkedinUrl: '', email: ''
  });
  const [apolloCompanyResults, setApolloCompanyResults] = useState(null);
  const [apolloPeopleResults, setApolloPeopleResults] = useState(null);
  const [apolloEnrichResult, setApolloEnrichResult] = useState(null);
  const [apolloLoading, setApolloLoading] = useState({ companies: false, people: false, enrich: false });
  const [apolloError, setApolloError] = useState(null);

  // Laminar Pilot state
  const [contactsTabSegment, setContactsTabSegment] = useState('all');
  const [pilotViewSegment, setPilotViewSegment] = useState(null);
  const [prospectorSegment, setProspectorSegment] = useState(null);
  const [sortBySegment, setSortBySegment] = useState({ energy_traders: 'heat', banks: 'heat', midstream: 'heat', inspection: 'heat' });
  const [refreshingSegments, setRefreshingSegments] = useState({});
  const [refreshAllProgress, setRefreshAllProgress] = useState(null);

  // Signals filtering state
  const [signalFilter, setSignalFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');

  // Score explanation state
  const [showScoreExplanation, setShowScoreExplanation] = useState(false);

  // Saved Segments state
  const [savedSegments, setSavedSegments] = useState([]);
  const [showSaveSegmentModal, setShowSaveSegmentModal] = useState(false);
  const [segmentName, setSegmentName] = useState('');
  const [activeSegment, setActiveSegment] = useState(null);
  const [activityTimeline, setActivityTimeline] = useState([]);

  // Kanban view state
  const [draggedCompany, setDraggedCompany] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);

  // Outreach Engine v2 state
  const [outreachPersona, setOutreachPersona] = useState('CFO');
  const [outreachTone, setOutreachTone] = useState('formal');
  const [outreachVariants, setOutreachVariants] = useState([]);
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [savedOutreachTemplates, setSavedOutreachTemplates] = useState([]);
  const [variantsByCompany, setVariantsByCompany] = useState({});

  // Light Sequencing state
  const [sequences, setSequences] = useState([]);
  const [showSequenceModal, setShowSequenceModal] = useState(false);
  const [selectedSequenceCompany, setSelectedSequenceCompany] = useState(null);

  const appendActivityEvent = useCallback((event) => {
    const normalizedEvent = {
      id: event.id || `activity_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: event.timestamp || new Date().toISOString(),
      category: event.category || 'activity',
      companyId: event.companyId || null,
      companyName: event.companyName || null,
      title: event.title || 'Activity captured',
      detail: event.detail || ''
    };

    setActivityTimeline((prev) => [normalizedEvent, ...prev].slice(0, 100));
  }, []);

  const refreshIntegrationHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const health = await netlifyAPI.getIntegrationHealth();
      setIntegrationHealth(health?.providers || []);
    } catch (error) {
      console.error('Failed to load integration health:', error);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const getCurrentFilters = () => {
    return {
      searchTerm,
      filterIndustry,
      filterState,
      signalFilter,
      severityFilter,
    };
  };

  const saveCurrentSegment = () => {
    if (!segmentName.trim()) return;

    const filteredCompanies = getFilteredCompanies();
    const newSegment = {
      id: Date.now().toString(),
      name: segmentName,
      filters: getCurrentFilters(),
      count: filteredCompanies.length,
      avgScore: filteredCompanies.length > 0 ?
        Math.round(filteredCompanies.reduce((sum, c) => sum + c.leadScore, 0) / filteredCompanies.length) : 0,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString()
    };

    setSavedSegments(prev => [...prev, newSegment]);
    setSegmentName('');
    setShowSaveSegmentModal(false);
    setActiveSegment(newSegment.id);
  };

  const loadSegment = (segment) => {
    const filters = segment.filters;
    setSearchTerm(filters.searchTerm || '');
    setFilterIndustry(filters.filterIndustry || 'all');
    setFilterState(filters.filterState || 'all');
    setSignalFilter(filters.signalFilter || 'all');
    setSeverityFilter(filters.severityFilter || 'all');

    // Update last used timestamp
    setSavedSegments(prev =>
      prev.map(s => s.id === segment.id ? { ...s, lastUsed: new Date().toISOString() } : s)
    );

    setActiveSegment(segment.id);
  };

  const deleteSegment = (segmentId) => {
    setSavedSegments(prev => prev.filter(s => s.id !== segmentId));
    if (activeSegment === segmentId) {
      setActiveSegment(null);
    }
  };

  const getFilteredCompanies = () => {
    return companies.filter(
      (company) =>
        company.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        (filterIndustry === 'all' || company.industry === filterIndustry) &&
        (filterState === 'all' || extractStateFromLocation(company.location) === filterState)
    );
  };

  // Kanban functions
  const updateCompanyStatus = (companyId, newStatus) => {
    setCompanies(prev =>
      prev.map(company =>
        company.id === companyId
          ? { ...company, status: newStatus }
          : company
      )
    );
  };

  const handleDragStart = (e, company) => {
    setDraggedCompany(company);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, columnStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(columnStatus);
  };

  const handleDragLeave = (e) => {
    // Only clear if we're actually leaving the column area
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = (e, newStatus) => {
    e.preventDefault();
    if (draggedCompany && draggedCompany.status !== newStatus) {
      updateCompanyStatus(draggedCompany.id, newStatus);
    }
    setDraggedCompany(null);
    setDragOverColumn(null);
  };

  const getKanbanColumns = () => {
    const statuses = ['New Lead', 'Contacted', 'Meeting', 'Nurture'];
    const filteredCompanies = getFilteredCompanies();

    return statuses.map(status => {
      const companies = filteredCompanies.filter(company => company.status === status);
      const avgScore = companies.length > 0
        ? Math.round(companies.reduce((sum, c) => sum + c.leadScore, 0) / companies.length)
        : 0;

      return {
        status,
        companies,
        count: companies.length,
        avgScore
      };
    });
  };

  const getDomainFromUrl = (url) => {
    try {
      const u = new URL(url.startsWith('http') ? url : `https://${url}`);
      return u.hostname;
    } catch {
      return url;
    }
  };

  const extractStateFromLocation = (location) => {
    if (!location) return '';
    // Extract state abbreviation from "City, ST" format
    const parts = location.split(', ');
    return parts.length > 1 ? parts[1].trim() : '';
  };

  const getUniqueStates = (companies) => {
    const states = new Set();
    companies.forEach(company => {
      const state = extractStateFromLocation(company.location);
      if (state) states.add(state);
    });
    return Array.from(states).sort();
  };

  const getUniqueIndustries = (companies) => {
    const industries = new Set();
    companies.forEach(company => {
      if (company.industry) industries.add(company.industry);
    });
    return Array.from(industries).sort();
  };

  const openEmailModal = (company) => {
    const executive = getPrimaryContact(company);
    setEmailData({
      to: executive?.email || '',
      subject: `Settlement workflow review for ${company.name}`,
      body: generatePersonalizedEmail(company, 'CFO', 'professional'),
      persona: 'CFO',
      tone: 'professional'
    });
    setShowEmailModal(true);
  };

  const openCalendarModal = (company) => {
    setSelectedCompany(company);
    setShowCalendarModal(true);
  };

  const handleMeetingScheduled = (leadId, meetingData) => {
    // Update the company status to "Meeting"
    setCompanies(prev => prev.map(company => {
      if (company.id === leadId) {
        return {
          ...company,
          status: 'Meeting',
          lastUpdated: new Date().toISOString(),
          recentActivity: [
            ...company.recentActivity || [],
            `Meeting scheduled for ${meetingData.date} at ${meetingData.time}`
          ]
        };
      }
      return company;
    }));

    appendActivityEvent({
      category: 'meeting',
      companyId: leadId,
      companyName: selectedCompany?.name || null,
      title: 'Meeting scheduled',
      detail: `${meetingData.date} at ${meetingData.time}`
    });

    // Show success message
    alert(`Meeting scheduled successfully! Calendar invite will be sent to ${selectedCompany?.executives?.[0]?.email || 'the contact'}.`);
  };

  const renderActivityTimeline = (company) => {
    if (!company) return null;

    // Generate activity items from company data
    const activities = [];

    // Add recent activities from company data
    if (company.recentActivity) {
      company.recentActivity.forEach((activity, index) => {
        const isRecentMeeting = activity.toLowerCase().includes('meeting scheduled');
        activities.push({
          id: `activity-${index}`,
          type: isRecentMeeting ? 'meeting' : 'activity',
          title: activity,
          timestamp: company.lastUpdated || new Date().toISOString(),
          icon: isRecentMeeting ? Calendar : AlertCircle,
          color: isRecentMeeting ? 'green' : 'blue'
        });
      });
    }

    // Add default activities if none exist
    if (activities.length === 0) {
      activities.push(
        {
          id: 'lead-identified',
          type: 'lead',
          title: 'Lead identified',
          timestamp: company.lastUpdated || new Date().toISOString(),
          icon: Star,
          color: 'blue'
        },
        {
          id: 'intel-gathered',
          type: 'intelligence',
          title: 'Company intelligence gathered',
          timestamp: new Date(Date.now() - 5 * 60000).toISOString(), // 5 minutes ago
          icon: Shield,
          color: 'gray'
        }
      );
    }

    // Sort by timestamp (newest first)
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const getActivityColor = (color) => {
      const colors = {
        blue: 'bg-blue-50 border-blue-200',
        green: 'bg-green-50 border-green-200',
        gray: 'bg-gray-50 border-gray-200',
        orange: 'bg-orange-50 border-orange-200'
      };
      return colors[color] || colors.gray;
    };

    const getDotColor = (color) => {
      const colors = {
        blue: 'bg-blue-500',
        green: 'bg-green-500',
        gray: 'bg-gray-400',
        orange: 'bg-orange-500'
      };
      return colors[color] || colors.gray;
    };

    const formatTimestamp = (timestamp) => {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now - date;
      const diffMinutes = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMinutes < 1) return 'Just now';
      if (diffMinutes < 60) return `${diffMinutes} min ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    };

    return activities.map((activity) => {
      const IconComponent = activity.icon;
      return (
        <div
          key={activity.id}
          className={`flex items-center gap-3 p-3 rounded-lg border ${getActivityColor(activity.color)}`}
        >
          <div className={`w-3 h-3 rounded-full ${getDotColor(activity.color)}`} />
          <IconComponent className="w-4 h-4 text-gray-500" />
          <div className="flex-1">
            <p className="font-medium text-sm">{activity.title}</p>
            <p className="text-xs text-gray-600">{formatTimestamp(activity.timestamp)}</p>
          </div>
          {activity.type === 'meeting' && (
            <Badge variant="outline" className="text-green-700 border-green-300">
              Scheduled
            </Badge>
          )}
        </div>
      );
    });
  };

  const renderSignalsTab = (company) => {
    if (!company) return null;

    // Generate sample signals for the company
    const signals = generateSignalsForCompany(company);

    const signalTypeIcons = {
      'breach_proximity': AlertTriangle,
      'reg_countdown': Clock,
      'exec_move': Users,
      'ins_renewal': Shield,
      'surface_regression': TrendingUp,
      'ai_gap': Brain,
      'rfp': Target,
      'workforce_stress': AlertCircle,
      'board_heat': Crown,
      'darkweb': Eye,
      'conference': Calendar,
      'consolidation': Star
    };

    const filteredSignals = signals.filter(signal => {
      if (signalFilter !== 'all' && signal.type !== signalFilter) return false;
      if (severityFilter !== 'all' && signal.severity !== severityFilter) return false;
      return true;
    });

    const formatSignalType = (type) => {
      const typeMap = {
        'breach_proximity': 'Breach Proximity',
        'reg_countdown': 'Regulatory Deadline',
        'exec_move': 'Executive Change',
        'ins_renewal': 'Insurance Renewal',
        'surface_regression': 'Security Regression',
        'ai_gap': 'AI Governance Gap',
        'rfp': 'RFP Activity',
        'workforce_stress': 'Workforce Stress',
        'board_heat': 'Board Priority',
        'darkweb': 'Dark Web Exposure',
        'conference': 'Conference Intent',
        'consolidation': 'SaaS Consolidation'
      };
      return typeMap[type] || type.replace('_', ' ');
    };

    const getSeverityColor = (severity) => {
      const colors = {
        'high': 'bg-red-100 text-red-800 border-red-200',
        'medium': 'bg-yellow-100 text-yellow-800 border-yellow-200',
        'low': 'bg-green-100 text-green-800 border-green-200'
      };
      return colors[severity] || colors.low;
    };

    const getScoreImpactColor = (impact) => {
      if (impact >= 25) return 'text-red-600 font-semibold';
      if (impact >= 15) return 'text-orange-600 font-medium';
      if (impact >= 5) return 'text-blue-600';
      return 'text-gray-600';
    };

    return (
      <div className="space-y-4">
        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Signal Intelligence
            </CardTitle>
          </CardHeader>
          <CardContent>
            {getSourceWarning(company.sourceMeta) && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {getSourceWarning(company.sourceMeta)}
              </div>
            )}
            <div className="flex gap-4 mb-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                <select
                  value={signalFilter}
                  onChange={(e) => setSignalFilter(e.target.value)}
                  className="border rounded px-2 py-1 text-sm"
                >
                  <option value="all">All Types</option>
                  <option value="breach_proximity">Breach Proximity</option>
                  <option value="reg_countdown">Regulatory</option>
                  <option value="exec_move">Executive Changes</option>
                  <option value="workforce_stress">Workforce Stress</option>
                  <option value="board_heat">Board Priority</option>
                  <option value="darkweb">Dark Web</option>
                  <option value="consolidation">Consolidation</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Severity:</span>
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="border rounded px-2 py-1 text-sm"
                >
                  <option value="all">All Levels</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Signals Timeline */}
        <Card>
          <CardHeader>
            <CardTitle>Active Signals ({filteredSignals.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredSignals.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No signals match the current filters</p>
                </div>
              ) : (
                filteredSignals.map((signal, index) => {
                  const IconComponent = signalTypeIcons[signal.type] || AlertCircle;
                  return (
                    <div
                      key={signal.id || index}
                      className="flex items-start gap-3 p-4 border rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex-shrink-0">
                        <IconComponent className="w-5 h-5 text-gray-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-sm">
                            {formatSignalType(signal.type)}
                          </h4>
                          <Badge className={`text-xs ${getSeverityColor(signal.severity)}`}>
                            {signal.severity.toUpperCase()}
                          </Badge>
                          <Badge variant="outline" className={`text-[10px] ${getSourceBadge(signal.meta).className}`}>
                            {getSourceBadge(signal.meta).label}
                          </Badge>
                          <span className={`text-xs ${getScoreImpactColor(signal.scoreImpact)}`}>
                            +{signal.scoreImpact} score
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 mb-2">{signal.details}</p>
                        <div className="text-xs text-gray-500">
                          {new Date(signal.occurredAt).toLocaleDateString()} •
                          Confidence: {Math.round((signal.confidence || 0) * 100)}%
                        </div>
                        {signal.evidence && signal.evidence.length > 0 && (
                          <details className="mt-2">
                            <summary className="text-xs text-blue-600 cursor-pointer hover:text-blue-800">
                              View Evidence ({signal.evidence.length})
                            </summary>
                            <div className="mt-1 pl-4 border-l-2 border-blue-200">
                              {signal.evidence.map((evidence, evidenceIndex) => (
                                <p key={evidenceIndex} className="text-xs text-gray-600 py-1">
                                  • {evidence}
                                </p>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const calculateScoreBreakdown = (company) => {
    const signals = generateSignalsForCompany(company);

    // Base score calculation
    let baseScore = 20;

    // Industry scoring
    const industryScores = {
      'Healthcare': 15,
      'Finance': 15,
      'Software': 12,
      'Technology': 12,
      'Manufacturing': 10,
      'Retail': 8
    };
    baseScore += industryScores[company.industry] || 5;

    // Size scoring
    if (company.employees >= 5000) baseScore += 15;
    else if (company.employees >= 1000) baseScore += 12;
    else if (company.employees >= 500) baseScore += 8;
    else if (company.employees >= 100) baseScore += 5;

    // News/activity scoring
    if (company.news && company.news.length > 0) {
      baseScore += Math.min(company.news.length * 2, 10);
    }

    baseScore = Math.min(baseScore, 60);

    // Signal impact calculation
    const signalImpact = signals.reduce((sum, signal) => sum + (signal.scoreImpact || 0), 0);

    // Freshness boost
    const freshnessBoost = company.lastUpdated ?
      (Date.now() - new Date(company.lastUpdated).getTime()) / (1000 * 60 * 60) <= 72 ? 5 : 0 : 0;

    // Staleness decay
    const stalenessDecay = company.lastUpdated ?
      Math.max(0, Math.floor((Date.now() - new Date(company.lastUpdated).getTime()) / (1000 * 60 * 60 * 24) * 0.5)) : 0;

    const finalScore = Math.max(0, Math.min(100, baseScore + signalImpact + freshnessBoost - stalenessDecay));

    return {
      finalScore: Math.round(finalScore),
      baseScore,
      signalImpact,
      freshnessBoost,
      stalenessDecay,
      signals,
      breakdown: [
        { label: 'Company Fundamentals', value: baseScore, type: 'base' },
        ...signals.slice(0, 3).map(signal => ({
          label: formatSignalTypeForBreakdown(signal.type),
          value: signal.scoreImpact,
          type: 'signal',
          details: signal.details
        })),
        ...(freshnessBoost > 0 ? [{ label: 'Recent Activity', value: freshnessBoost, type: 'freshness' }] : []),
        ...(stalenessDecay > 0 ? [{ label: 'Staleness Penalty', value: -stalenessDecay, type: 'decay' }] : [])
      ].filter(item => item.value !== 0)
    };
  };

  const formatSignalTypeForBreakdown = (type) => {
    const typeMap = {
      'breach_proximity': 'Breach Risk',
      'reg_countdown': 'Regulatory Pressure',
      'exec_move': 'Executive Change',
      'ins_renewal': 'Insurance Renewal',
      'surface_regression': 'Security Regression',
      'ai_gap': 'AI Governance Gap',
      'rfp': 'RFP Activity',
      'workforce_stress': 'Workforce Stress',
      'board_heat': 'Board Priority',
      'darkweb': 'Dark Web Exposure',
      'conference': 'Conference Intent',
      'consolidation': 'SaaS Consolidation'
    };
    return typeMap[type] || type.replace('_', ' ');
  };

  const renderScoreExplanation = (company) => {
    const breakdown = calculateScoreBreakdown(company);
    const hasNonLiveSignals = breakdown.signals.some((signal) => isNonLiveMeta(signal.meta));

    return (
      <div className="absolute top-full right-0 mt-2 w-80 bg-white border rounded-lg shadow-lg z-50 p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-sm">Score Breakdown</h3>
          <button
            onClick={() => setShowScoreExplanation(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </div>

        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Top 3 score drivers</div>
        <div className="space-y-2 mb-3">
          {breakdown.breakdown.map((item, index) => (
            <div key={index} className="flex justify-between items-center py-1">
              <div className="flex-1">
                <span className="text-sm text-gray-700">{item.label}</span>
                {item.details && (
                  <p className="text-xs text-gray-500 mt-1">{item.details}</p>
                )}
              </div>
              <span className={`text-sm font-medium ${
                item.value > 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {item.value > 0 ? '+' : ''}{item.value}
              </span>
            </div>
          ))}
        </div>

        <div className="border-t pt-2">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-sm">Total Score</span>
            <span className="font-bold text-lg">{breakdown.finalScore}/100</span>
          </div>
        </div>

        {hasNonLiveSignals && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-800">
            Score includes fallback or AI-generated intelligence.
          </div>
        )}

        <div className="mt-3 text-xs text-gray-500">
          <p>• Base score from industry, size, and activity</p>
          <p>• Signal impacts reflect urgency across finance and operations</p>
          <p>• Freshness boost for recent updates (72h)</p>
        </div>
      </div>
    );
  };

  const generateDecisionCards = (company) => {
    const signals = generateSignalsForCompany(company);
    const topSignals = signals.slice(0, 3);

    const whyNow = [];
    const whatFirst = [];
    const risksWaiting = [];

    // Generate Why Now based on signals
    if (topSignals.length > 0) {
      topSignals.forEach(signal => {
        switch (signal.type) {
          case 'reg_countdown':
            whyNow.push('A compliance milestone is approaching');
            risksWaiting.push('Delay raises audit and process risk');
            break;
          case 'workforce_stress':
            whyNow.push('Open roles suggest team strain in finance operations');
            whatFirst.push('Map where staffing gaps are slowing throughput');
            break;
          case 'board_heat':
            whyNow.push('Leadership attention is already on operational risk');
            whatFirst.push('Prepare an executive view of timing, friction, and impact');
            break;
          case 'breach_proximity':
            whyNow.push('External disruption raises urgency to tighten controls');
            risksWaiting.push('Counterparty and process exposure can spread quickly');
            break;
          case 'darkweb':
            whyNow.push('Sensitive data exposure increases control pressure');
            whatFirst.push('Review access, counterparties, and exception handling');
            risksWaiting.push('Operational disruption can spill into settlements');
            break;
          case 'ins_renewal':
            whyNow.push('Insurance timing can force faster control reviews');
            whatFirst.push('Review control gaps before renewal discussions');
            break;
          case 'exec_move':
            whyNow.push('New finance leadership often reopens workflow decisions');
            whatFirst.push('Align outreach to current capital and timing priorities');
            break;
          case 'rfp':
            whyNow.push('Active procurement suggests a live buying window');
            risksWaiting.push('A vendor decision may close without your input');
            break;
        }
      });
    }

    // Add default recommendations based on company profile
    if (company.industry === 'Healthcare') {
      whatFirst.push('Review document flow and exception handling for regulated approvals');
      risksWaiting.push('Manual delays can slow approvals and increase compliance exposure');
    } else if (company.industry === 'Finance') {
      whatFirst.push('Review liquidity drag, reconciliation delays, and approval bottlenecks');
      risksWaiting.push('Working capital remains tied up in avoidable friction');
    }

    if (company.employees > 1000) {
      whatFirst.push('Prioritize one enterprise workflow with measurable capital impact');
    } else {
      whatFirst.push('Tighten one team workflow before scaling the program');
    }

    // Ensure we have content for each card
    if (whyNow.length === 0) whyNow.push('Current operating pressure creates a useful window for change');
    if (whatFirst.length === 0) whatFirst.push('Assess settlement timing, liquidity drag, and workflow bottlenecks');
    if (risksWaiting.length === 0) risksWaiting.push('Manual friction and hidden timing risk continue to compound');

    return {
      whyNow: whyNow.slice(0, 3),
      whatFirst: whatFirst.slice(0, 3),
      risksWaiting: risksWaiting.slice(0, 3)
    };
  };

  const generateHealthMeters = (company) => {
    const domain = company.domain || 'example.com';
    const hash = domain.split('').reduce((a, b) => a + b.charCodeAt(0), 0);

    // Generate deterministic but realistic health scores
    const mfaSso = {
      score: ((hash % 40) + 60), // 60-100
      status: 'good',
      details: ['Multi-factor authentication enabled', 'SSO integration active', 'Password policies enforced']
    };

    const edr = {
      score: ((hash * 3) % 50) + 50, // 50-100
      status: 'medium',
      details: ['Endpoint detection deployed', 'Response automation partial', 'Coverage needs improvement']
    };

    const siem = {
      score: ((hash * 7) % 60) + 40, // 40-100
      status: 'poor',
      details: ['Basic logging enabled', 'SIEM solution needed', 'Alert correlation missing']
    };

    // Determine status based on score
    [mfaSso, edr, siem].forEach(meter => {
      if (meter.score >= 80) meter.status = 'good';
      else if (meter.score >= 60) meter.status = 'medium';
      else meter.status = 'poor';
    });

    return { mfaSso, edr, siem };
  };

  const getHealthMeterColor = (status) => {
    switch (status) {
      case 'good': return 'bg-green-500';
      case 'medium': return 'bg-yellow-500';
      case 'poor': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getHealthMeterTextColor = (status) => {
    switch (status) {
      case 'good': return 'text-green-700';
      case 'medium': return 'text-yellow-700';
      case 'poor': return 'text-red-700';
      default: return 'text-gray-700';
    }
  };

  const generateSignalsForCompany = (company) => {
    if (Array.isArray(company?.signals) && company.signals.length > 0) {
      return company.signals
        .map((signal) => ({
          ...signal,
          meta: signal.meta || company.sourceMeta
        }))
        .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
    }

    // Preserve demo continuity, but label the synthesized local demo signals clearly.
    const signals = [];
    const demoMeta = {
      source: 'mock',
      provider: 'local_demo',
      live: false,
      fallbackUsed: true,
      reason: 'No server-side signals were available; local demo signals are being shown.'
    };

    // Add some sample signals based on company characteristics
    if (company.industry === 'Healthcare') {
      signals.push({
        id: 'reg-1',
        type: 'reg_countdown',
        severity: 'high',
        scoreImpact: 30,
        occurredAt: new Date().toISOString(),
        details: 'HIPAA compliance audit due in 45 days',
        confidence: 0.72,
        evidence: ['Compliance calendar reviewed', 'Previous audit cycle analysis', 'Industry regulatory timeline'],
        meta: demoMeta
      });
    }

    if (company.employees > 1000) {
      signals.push({
        id: 'workforce-1',
        type: 'workforce_stress',
        severity: 'medium',
        scoreImpact: 20,
        occurredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        details: '3 open trade finance roles, average 67 days open',
        confidence: 0.58,
        evidence: ['LinkedIn job postings', 'Company career page', 'Industry hiring trends'],
        meta: demoMeta
      });
    }

    if (company.news && company.news.length > 0) {
      signals.push({
        id: 'board-1',
        type: 'board_heat',
        severity: 'high',
        scoreImpact: 25,
        occurredAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        details: 'Cybersecurity mentioned 4 times in recent earnings call',
        confidence: 0.68,
        evidence: ['Earnings call transcript', 'Board meeting minutes', 'Executive statements'],
        meta: demoMeta
      });
    }

    // Add a default set of signals for demonstration
    signals.push(
      {
        id: 'breach-1',
        type: 'breach_proximity',
        severity: 'medium',
        scoreImpact: 15,
        occurredAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        details: 'Vendor security incident affects similar companies',
        confidence: 0.51,
        evidence: ['Industry threat intelligence', 'Vendor security bulletins', 'Peer company analysis'],
        meta: demoMeta
      },
      {
        id: 'consolidation-1',
        type: 'consolidation',
        severity: 'low',
        scoreImpact: 12,
        occurredAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        details: '23% potential savings from tool consolidation',
        confidence: 0.6,
        evidence: ['Technology stack analysis', 'Vendor overlap assessment', 'Cost optimization opportunities'],
        meta: demoMeta
      }
    );

    return signals.sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
  };

  const getSortedContacts = (company) => {
    const contacts = company?.contacts || company?.executives || [];
    return [...contacts].sort((a, b) => {
      if (a.priorityRank && b.priorityRank) {
        return a.priorityRank - b.priorityRank;
      }
      return (b.relevanceScore || 0) - (a.relevanceScore || 0);
    });
  };

  const getPrimaryContact = (company) => getSortedContacts(company)[0];

  const getRoleCategoryLabel = (roleCategory) => {
    if (roleCategory === 'decision_maker') return 'Decision Maker';
    if (roleCategory === 'operator') return 'Operator';
    if (roleCategory === 'influencer') return 'Influencer';
    if (roleCategory === 'low_priority') return 'Low Priority';
    if (roleCategory === 'ignore') return 'Ignored';
    return 'Contact';
  };

  const getSegmentForContact = (contact) => {
    if (!contact) return null;
    if (contact.segment) return contact.segment;
    if (contact.sourceMeta?.segment) return contact.sourceMeta.segment;
    try {
      return inferContactSegment(contact);
    } catch {
      return null;
    }
  };

  const groupContactsByRole = (company, segmentFilter = 'all') => {
    let contacts = getSortedContacts(company);
    if (segmentFilter && segmentFilter !== 'all') {
      contacts = contacts.filter((contact) => getSegmentForContact(contact) === segmentFilter);
    }
    return [
      { key: 'decision_maker', label: 'Decision Makers', contacts: contacts.filter((contact) => contact.roleCategory === 'decision_maker') },
      { key: 'operator', label: 'Operators', contacts: contacts.filter((contact) => contact.roleCategory === 'operator') },
      { key: 'influencer', label: 'Influencers', contacts: contacts.filter((contact) => contact.roleCategory === 'influencer') }
    ];
  };

  const getCompanySegmentCounts = (company) => {
    const contacts = getSortedContacts(company);
    const counts = new Map();
    for (const contact of contacts) {
      const seg = getSegmentForContact(contact);
      if (!seg) continue;
      counts.set(seg, (counts.get(seg) || 0) + 1);
    }
    return counts;
  };

  const generatePersonalizedEmail = (company, persona, tone) => {
    const executive = getPrimaryContact(company);
    const executiveTitle = executive?.title || 'Finance Decision Maker';
    const toneContext = tone === 'urgent'
      ? 'This is time-sensitive because small delays can compound quickly in settlement workflows.'
      : tone === 'casual'
        ? 'This may be worth a quick comparison against how peer teams are operating today.'
        : 'I wanted to keep this concise and grounded in operating impact.';

    const personaFocus = {
      CFO: 'capital efficiency, liquidity planning, and settlement risk',
      'Head of Trade Finance': 'process friction, document delays, and settlement timing',
      'Settlement Manager': 'reconciliation quality, exception handling, and manual workflow risk',
      'Operations Lead': 'daily operational bottlenecks, timing gaps, and tooling friction'
    };

    return `Dear ${executive?.name || executiveTitle},

I’m reaching out because ${company.name} appears to have meaningful trade finance and settlement complexity that often creates avoidable working-capital drag.

Based on our research, we see a few areas worth reviewing:

${company.concerns?.slice(0, 2).map(concern => `• ${concern}`).join('\n')}

Given your role in ${personaFocus[persona]} at ${company.name}, a brief conversation about current operating friction could be useful.

${toneContext}

Our team helps firms reduce settlement friction, improve liquidity visibility, and tighten operational controls without adding more manual overhead.

Would you be open to a 15-minute call next week to compare notes on settlement risk, process friction, and working-capital impact?

Best regards,
[Your Name]
Laminar Digital

P.S. If helpful, I can share examples of where teams typically uncover reconciliation delays, approval bottlenecks, and liquidity leakage in similar operating models.`;
  };

  const sendEmail = async () => {
    if (!emailData.to || !emailData.subject || !emailData.body) {
      alert('Please fill in all required fields');
      return;
    }

    setEmailSending(true);
    try {
      const result = await netlifyAPI.sendEmail(
        emailData.to,
        emailData.subject,
        emailData.body,
        selectedCompany?.id,
        emailData.persona,
        emailData.tone
      );

      if (result?.success) {
        setLastEmailResult(result);
        alert(result?.meta?.source === 'simulated' ? 'Email simulated successfully.' : 'Email sent successfully.');
        setShowEmailModal(false);
        // Log the communication
        console.log('Email sent:', result);
      } else {
        throw new Error(result?.error || 'Failed to send email');
      }
    } catch (error) {
      console.error('Email send error:', error);
      alert(`Failed to send email: ${error.message}`);
    } finally {
      setEmailSending(false);
    }
  };

  const runTechAnalysis = async () => {
    if (!selectedCompany?.website) {
      alert('No website on this company card.');
      return;
    }
    setAnalysis(null);
    setAnalysisError(null);
    setAnalysisLoading(true);
    try {
      const domain = getDomainFromUrl(selectedCompany.website);
      const result = await netlifyAPI.analyzeTech(domain);
      if (result?.success) setAnalysis(result.analysis);
      else throw new Error(result?.error || 'Unknown analysis error');
    } catch (e) {
      setAnalysisError(e.message);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const splitTokens = (raw) =>
    (raw || '')
      .split(/[,\n]/)
      .map(t => t.trim())
      .filter(Boolean);

  const runApolloCompanySearch = async () => {
    const keywords = splitTokens(apolloKeywordsInput);
    if (keywords.length === 0) {
      setApolloError('Enter at least one keyword (comma-separated).');
      return;
    }
    setApolloError(null);
    setApolloLoading(prev => ({ ...prev, companies: true }));
    try {
      const result = await netlifyAPI.apolloCompanySearch(keywords, { scoringProfile: apolloProfile });
      setApolloCompanyResults(result);
      // Merge new leads into the main list so existing rendering picks them up
      if (result?.leads?.length) {
        setCompanies(prev => {
          const existingIds = new Set(prev.map(c => c.id));
          const novel = result.leads.filter(l => !existingIds.has(l.id));
          return [...novel, ...prev];
        });
      }
    } catch (e) {
      setApolloError(e.message || 'Apollo company search failed');
    } finally {
      setApolloLoading(prev => ({ ...prev, companies: false }));
    }
  };

  const runApolloPeopleSearch = async () => {
    const titles = splitTokens(apolloTitlesInput);
    if (titles.length === 0) {
      setApolloError('Enter at least one job title (comma-separated).');
      return;
    }
    const domains = splitTokens(apolloDomainsInput);
    setApolloError(null);
    setApolloLoading(prev => ({ ...prev, people: true }));
    try {
      const result = await netlifyAPI.apolloPeopleSearch(titles, domains, { scoringProfile: apolloProfile });
      setApolloPeopleResults(result);
    } catch (e) {
      setApolloError(e.message || 'Apollo people search failed');
    } finally {
      setApolloLoading(prev => ({ ...prev, people: false }));
    }
  };

  const mergeApolloPeopleIntoCompanies = (people, meta, segmentId) => {
    const byDomain = new Map();
    for (const person of people) {
      const domain = (person.organizationDomain || person.organization?.primary_domain || person.organization_domain || '').toLowerCase().trim();
      const orgName = person.organizationName || person.organization?.name || person.organization_name || domain || 'Unknown';
      const key = domain || orgName.toLowerCase();
      if (!byDomain.has(key)) byDomain.set(key, { domain, orgName, contacts: [] });
      byDomain.get(key).contacts.push({
        name: person.name || `${person.firstName || ''} ${person.lastName || ''}`.trim() || 'Unknown',
        title: person.title || person.headline || '',
        email: person.email || '',
        relevanceScore: Number(person.relevanceScore || person.score || 0),
        roleCategory: person.roleCategory || null,
        segment: person.segment || segmentId,
        sourceMeta: { ...(meta || {}), segment: person.segment || segmentId }
      });
    }

    setCompanies((prev) => {
      const next = [...prev];
      for (const [, group] of byDomain) {
        const existingIdx = next.findIndex((c) => {
          const cDomain = (c.domain || c.website || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
          return cDomain === group.domain || (c.name || '').toLowerCase() === group.orgName.toLowerCase();
        });
        if (existingIdx >= 0) {
          const existing = next[existingIdx];
          const existingEmails = new Set((existing.contacts || []).map((c) => (c.email || '').toLowerCase()).filter(Boolean));
          const newOnes = group.contacts.filter((c) => !c.email || !existingEmails.has(c.email.toLowerCase()));
          next[existingIdx] = {
            ...existing,
            contacts: [...(existing.contacts || []), ...newOnes],
            executives: [...(existing.executives || []), ...newOnes],
            lastUpdated: new Date().toISOString()
          };
        } else {
          next.push(decorateLeadWithMeta({
            id: `apollo-${group.domain || group.orgName}-${Date.now()}`,
            name: group.orgName,
            domain: group.domain,
            website: group.domain ? `https://${group.domain}` : '',
            industry: 'Energy',
            employees: 0,
            location: '',
            leadScore: 50,
            priority: 'Medium',
            status: 'New Lead',
            contacts: group.contacts,
            executives: group.contacts,
            news: [],
            recentActivity: [],
            signals: [],
            segment: segmentId,
            sourceMeta: { ...(meta || {}), segment: segmentId }
          }, meta || {}));
        }
      }
      return next;
    });
  };

  const refreshSegment = async (segmentId) => {
    const segment = LAMINAR_SEGMENTS[segmentId];
    if (!segment) return;
    setRefreshingSegments((prev) => ({ ...prev, [segmentId]: true }));
    setApolloError(null);
    try {
      const result = await netlifyAPI.apolloPeopleSearch(
        segment.titles,
        segment.domains,
        { scoringProfile: 'commodity_trading', segment: segmentId }
      );
      if (result?.success && Array.isArray(result.people) && result.people.length > 0) {
        mergeApolloPeopleIntoCompanies(result.people, result.meta || {}, segmentId);
        appendActivityEvent({
          category: 'lead_refresh',
          title: `${segment.label} refreshed`,
          detail: `${result.people.length} contacts from Apollo Laminar`
        });
      } else {
        appendActivityEvent({
          category: 'lead_refresh',
          title: `${segment.label} refresh — no new contacts`,
          detail: 'Apollo returned an empty result for this segment.'
        });
      }
    } catch (e) {
      setApolloError(`${segment.label} refresh failed: ${e.message}`);
    } finally {
      setRefreshingSegments((prev) => ({ ...prev, [segmentId]: false }));
    }
  };

  const refreshAllSegments = async () => {
    const segments = LAMINAR_SEGMENT_ORDER;
    for (let i = 0; i < segments.length; i += 1) {
      const segId = segments[i];
      setRefreshAllProgress({ current: i + 1, total: segments.length, label: LAMINAR_SEGMENTS[segId].label });
      await refreshSegment(segId);
    }
    setRefreshAllProgress(null);
  };

  const runApolloPersonEnrich = async () => {
    const { firstName, lastName, linkedinUrl, email } = apolloEnrichInput;
    if (!firstName && !lastName && !linkedinUrl && !email) {
      setApolloError('Provide at least one of: name, LinkedIn URL, or email.');
      return;
    }
    setApolloError(null);
    setApolloLoading(prev => ({ ...prev, enrich: true }));
    try {
      const result = await netlifyAPI.apolloPersonEnrich({ ...apolloEnrichInput, scoringProfile: apolloProfile });
      setApolloEnrichResult(result);
    } catch (e) {
      setApolloError(e.message || 'Apollo person enrichment failed');
    } finally {
      setApolloLoading(prev => ({ ...prev, enrich: false }));
    }
  };

  // Outreach Engine v2 Functions
  const generateOutreachVariants = useCallback(async (company) => {
    if (!company) return;

    const signals = generateSignalsForCompany(company);
    const topSignals = signals
      .sort((a, b) => (b.scoreImpact || 0) - (a.scoreImpact || 0))
      .slice(0, 3);

    const variants = [];

    // Generate Variant A - Direct approach with primary signal
    const variantA = generateEmailVariant(company, outreachPersona, outreachTone, topSignals[0], 'direct');
    variants.push({
      ...variantA,
      strategy: 'Direct approach focusing on primary risk signal'
    });

    // Generate Variant B - Consultative approach with secondary signal
    const variantB = generateEmailVariant(company, outreachPersona, outreachTone, topSignals[1] || topSignals[0], 'consultative');
    variants.push({
      ...variantB,
      strategy: 'Consultative approach with industry insights'
    });

    setOutreachVariants(variants);
    setSelectedVariant(0);
    setVariantsByCompany(prev => ({
      ...prev,
      [company.id]: variants
    }));
    appendActivityEvent({
      category: 'outreach',
      companyId: company.id,
      companyName: company.name,
      title: 'Outreach variants generated',
      detail: `${variants.length} variants prepared for ${outreachPersona}`
    });
  }, [appendActivityEvent, outreachPersona, outreachTone]);

  const generateEmailVariant = (company, persona, tone, signal, approach) => {
    const personaConfig = getPersonaConfig(persona);

    const topSignal = signal || { type: 'general', details: 'settlement workflow assessment' };

    // Generate subject lines based on approach
    const subjects = approach === 'direct'
      ? generateDirectSubjects(company, topSignal, personaConfig)
      : generateConsultativeSubjects(company);

    const subject = subjects[Math.floor(Math.random() * subjects.length)];

    // Generate email body
    const body = generateEmailBody(company, persona, tone, topSignal, approach);

    return {
      subject,
      body,
      topSignal: `${formatSignalType(topSignal.type)}: ${topSignal.details}`,
      persona,
      tone,
      approach
    };
  };

  const getPersonaConfig = (persona) => {
    const configs = {
      CFO: {
        title: 'CFO',
        focus: 'capital efficiency and liquidity',
        concerns: ['working capital drag', 'settlement risk', 'financial control discipline'],
        language: ['liquidity impact', 'capital efficiency', 'control effectiveness'],
        priorities: ['faster cash conversion', 'reduced exception cost', 'better control visibility']
      },
      'Head of Trade Finance': {
        title: 'Head of Trade Finance',
        focus: 'document flow and settlement timing',
        concerns: ['document delays', 'counterparty friction', 'cycle-time bottlenecks'],
        language: ['process friction', 'document exceptions', 'timing reliability'],
        priorities: ['fewer delays', 'smoother handoffs', 'better counterparty coordination']
      },
      'Settlement Manager': {
        title: 'Settlement Manager',
        focus: 'reconciliation and exception handling',
        concerns: ['manual workflows', 'break resolution', 'handoff errors'],
        language: ['reconciliation effort', 'exception volume', 'operational throughput'],
        priorities: ['fewer breaks', 'lower manual effort', 'cleaner daily operations']
      },
      'Operations Lead': {
        title: 'Operations Lead',
        focus: 'day-to-day operational efficiency',
        concerns: ['tooling gaps', 'handoff friction', 'approval latency'],
        language: ['operational friction', 'team capacity', 'workflow drag'],
        priorities: ['better throughput', 'less rework', 'more predictable execution']
      }
    };
    return configs[persona] || configs.CFO;
  };

  const getToneConfig = (tone) => {
    const configs = {
      formal: {
        greeting: 'Dear',
        style: 'professional and respectful',
        closing: 'Best regards',
        language: 'formal business language'
      },
      plain: {
        greeting: 'Hi',
        style: 'direct and clear',
        closing: 'Thanks',
        language: 'simple, straightforward language'
      },
      urgent: {
        greeting: 'Hi',
        style: 'time-sensitive and compelling',
        closing: 'Urgently',
        language: 'action-oriented with urgency indicators'
      }
    };
    return configs[tone] || configs.formal;
  };

  const generateDirectSubjects = (company, signal, personaConfig) => {
    const signalType = formatSignalType(signal.type);
    return [
      `${company.name}: ${signalType} Priority`,
      `Urgent: ${signalType} Pressure at ${company.name}`,
      `${company.name} ${signalType} - Immediate Review`,
      `${personaConfig.title} Alert: ${signalType} at ${company.name}`,
      `Time-Sensitive: ${company.name} Process Gap Identified`
    ];
  };

  const generateConsultativeSubjects = (company) => {
    return [
      `${company.name}: Trade Operations Benchmarking`,
      `${company.industry} Workflow Insights for ${company.name}`,
      `Peer Analysis: How ${company.name} Compares Operationally`,
      `${company.name}: Settlement Efficiency Discussion`,
      `${company.industry} Timing Trends - ${company.name} Impact`
    ];
  };

  const generateEmailBody = (company, persona, tone, signal, approach) => {
    const personaConfig = getPersonaConfig(persona);
    const toneConfig = getToneConfig(tone);
    const signalType = formatSignalType(signal.type);

    const executive = company.executives && company.executives[0]
      ? company.executives[0]
      : { name: `${personaConfig.title}`, title: personaConfig.title };

    let greeting = `${toneConfig.greeting} ${executive.name}`;

    let opening = '';
    if (approach === 'direct') {
      opening = `I noticed ${company.name} has a ${signalType.toLowerCase()} situation that requires immediate ${personaConfig.focus} attention.`;
    } else {
      opening = `I've been analyzing trade operations patterns in the ${company.industry.toLowerCase()} sector and noticed some themes that might interest you.`;
    }

    let context = '';
    if (signal && signal.details) {
      context = `Specifically, ${signal.details.toLowerCase()}. `;
    }

    let businessImpact = '';
    if (persona === 'CFO') {
      businessImpact = `This could affect ${company.name}'s liquidity efficiency, control cost, and working-capital performance. `;
    } else if (persona === 'Head of Trade Finance') {
      businessImpact = `This can slow document flow, delay settlement timing, and increase counterparty friction. `;
    } else if (persona === 'Settlement Manager' || persona === 'Operations Lead') {
      businessImpact = `This presents day-to-day operational friction that can increase rework, exceptions, and manual effort. `;
    } else {
      businessImpact = `This creates avoidable execution risk across trade operations. `;
    }

    let solution = '';
    if (approach === 'direct') {
      solution = `Based on what I'm seeing, ${company.name} would benefit from:

• ${personaConfig.priorities[0]} implementation
• ${personaConfig.priorities[1]} assessment
• ${personaConfig.priorities[2]} strategy review`;
    } else {
      solution = `Companies similar to ${company.name} in the ${company.industry.toLowerCase()} space are focusing on:

• Strategic ${personaConfig.priorities[0]} initiatives
• ${personaConfig.priorities[1]} optimization
• ${personaConfig.priorities[2]} planning`;
    }

    let cta = '';
    if (tone === 'urgent') {
      cta = `Given the time-sensitive nature of this issue, would you have 15 minutes this week to discuss ${company.name}'s immediate process priorities?`;
    } else if (tone === 'plain') {
      cta = `Would a brief 15-minute call next week be helpful to discuss how other ${company.industry.toLowerCase()} teams are handling this?`;
    } else {
      cta = `I would welcome the opportunity to share relevant operating insights in a brief 15-minute conversation at your convenience.`;
    }

    let closing = toneConfig.closing;
    let signature = `[Your Name]
Laminar Digital
[Your Contact Information]`;

    let ps = '';
    if (company.techStack && company.techStack.length > 0) {
      ps = `\n\nP.S. I noticed ${company.name} is using ${company.techStack[0]} - happy to compare where similar teams see workflow drag in their current tooling mix.`;
    }

    return `${greeting},

${opening}

${context}${businessImpact}

${solution}

${cta}

${closing},
${signature}${ps}`;
  };

  const formatSignalType = (type) => {
    const typeMap = {
      'breach_proximity': 'Breach Proximity',
      'reg_countdown': 'Regulatory Deadline',
      'exec_move': 'Executive Change',
      'ins_renewal': 'Insurance Renewal',
      'surface_regression': 'Security Regression',
      'ai_gap': 'AI Governance Gap',
      'rfp': 'RFP Activity',
      'workforce_stress': 'Workforce Stress',
      'board_heat': 'Board Priority',
      'darkweb': 'Dark Web Exposure',
      'conference': 'Conference Intent',
      'consolidation': 'SaaS Consolidation',
      'general': 'Security Assessment'
    };
    return typeMap[type] || type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const sendOutreach = async (company, variant) => {
    if (!company || !variant) {
      alert('Missing company or variant information');
      return;
    }

    try {
      const executive = company.executives && company.executives[0]
        ? company.executives[0]
        : { email: 'contact@' + (company.domain || 'company.com'), name: 'Executive' };

      const emailResult = await netlifyAPI.sendEmail(
        executive.email,
        variant.subject,
        variant.body,
        company.id,
        variant.persona,
        variant.tone
      );
      setLastEmailResult(emailResult);

      // Store outreach in company history
      const outreachRecord = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        type: 'email',
        status: emailResult?.meta?.source === 'simulated' ? 'simulated' : 'sent',
        subject: variant.subject,
        body: variant.body,
        persona: variant.persona,
        tone: variant.tone,
        approach: variant.approach,
        topSignal: variant.topSignal,
        recipient: executive.email,
        sourceMeta: emailResult?.meta
      };

      // Update company with outreach history
      const updatedCompany = {
        ...company,
        outreachHistory: [...(company.outreachHistory || []), outreachRecord],
        lastContactDate: new Date().toISOString(),
        chosenVariant: variant
      };

      // Update companies list
      setCompanies(prev => prev.map(c =>
        c.id === company.id ? updatedCompany : c
      ));

      // Update selected company if it's the current one
      if (selectedCompany?.id === company.id) {
        setSelectedCompany(updatedCompany);
      }

      appendActivityEvent({
        category: 'outreach',
        companyId: company.id,
        companyName: company.name,
        title: emailResult?.meta?.source === 'simulated' ? 'Outreach simulated' : 'Outreach sent',
        detail: `${variant.persona} / ${variant.tone} -> ${executive.email}`
      });

      alert(emailResult?.meta?.source === 'simulated'
        ? `Outreach simulated for ${executive.email}`
        : `Outreach sent successfully to ${executive.email}`);

    } catch (error) {
      console.error('Failed to send outreach:', error);
      alert('Failed to send outreach. Please try again.');
    }
  };

  const saveOutreachTemplate = (company, variant) => {
    if (!variant) {
      alert('No variant selected to save');
      return;
    }

    const template = {
      id: Date.now().toString(),
      name: `${company.name} - ${variant.persona} ${variant.tone}`,
      persona: variant.persona,
      tone: variant.tone,
      approach: variant.approach,
      subject: variant.subject,
      body: variant.body,
      topSignal: variant.topSignal,
      createdAt: new Date().toISOString()
    };

    setSavedOutreachTemplates(prev => [template, ...prev].slice(0, 50));
    appendActivityEvent({
      category: 'outreach',
      companyId: company.id,
      companyName: company.name,
      title: 'Outreach template saved',
      detail: template.name
    });

    alert(`Template saved: ${template.name}`);
  };

  const addToSequence = (company, variant) => {
    if (!company || !variant) {
      alert('Missing company or variant information');
      return;
    }

    setSelectedSequenceCompany(company);
    setShowSequenceModal(true);
  };

  // Light Sequencing Functions
  const createSequence = (company, initialVariant) => {
    if (!company || !initialVariant) return;

    const sequenceId = `seq_${Date.now()}`;
    const startDate = new Date();

    // Generate signals for different touches
    const signals = generateSignalsForCompany(company);
    const topSignals = signals
      .sort((a, b) => (b.scoreImpact || 0) - (a.scoreImpact || 0))
      .slice(0, 3);

    // Ensure we have signals for each touch
    const touch1Signal = topSignals[0] || { type: 'general', details: 'settlement workflow assessment' };
    const touch2Signal = topSignals[1] || { type: 'compliance', details: 'operating control review' };
    const touch3Signal = topSignals[2] || { type: 'optimization', details: 'reconciliation and approval optimization' };

    const newSequence = {
      id: sequenceId,
      companyId: company.id,
      companyName: company.name,
      status: 'active',
      createdAt: startDate.toISOString(),
      persona: initialVariant.persona,
      tone: initialVariant.tone,
      touches: [
        {
          id: 1,
          type: 'email',
          title: 'Initial Email',
          dueDate: new Date(startDate.getTime()).toISOString(),
          status: 'pending',
          signal: touch1Signal,
          subject: initialVariant.subject,
          body: initialVariant.body,
          completed: false,
          completedAt: null
        },
        {
          id: 2,
          type: 'linkedin',
          title: 'LinkedIn Note',
          dueDate: new Date(startDate.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString(), // +4 days
          status: 'pending',
          signal: touch2Signal,
          subject: generateLinkedInMessage(company, touch2Signal, initialVariant.persona),
          body: '',
          completed: false,
          completedAt: null
        },
        {
          id: 3,
          type: 'email',
          title: 'Follow-up Email',
          dueDate: new Date(startDate.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString(), // +10 days
          status: 'pending',
          signal: touch3Signal,
          subject: generateFollowUpSubject(company, touch3Signal),
          body: generateFollowUpEmail(company, initialVariant.persona, touch3Signal),
          completed: false,
          completedAt: null
        }
      ]
    };

    // Update sequences state
    setSequences(prev => [...prev, newSequence]);

    // Update company with sequence info
    const updatedCompany = {
      ...company,
      activeSequence: sequenceId,
      sequenceStartDate: startDate.toISOString()
    };

    setCompanies(prev => prev.map(c =>
      c.id === company.id ? updatedCompany : c
    ));

    if (selectedCompany?.id === company.id) {
      setSelectedCompany(updatedCompany);
    }

    appendActivityEvent({
      category: 'sequence',
      companyId: company.id,
      companyName: company.name,
      title: '3-touch sequence created',
      detail: `${initialVariant.persona} / ${initialVariant.tone}`
    });

    setShowSequenceModal(false);
    alert(`3-touch sequence created for ${company.name}`);
  };

  const generateLinkedInMessage = (company, signal, persona) => {
    const signalType = formatSignalType(signal.type);
    const personaConfig = getPersonaConfig(persona);

    const messages = [
      `Hi! I noticed ${company.name} might be dealing with ${signalType.toLowerCase()}. As a ${personaConfig.title}, this probably impacts your ${personaConfig.focus}. Worth a quick chat?`,
      `Following up on finance-operations trends in ${company.industry}. Seeing ${signalType.toLowerCase()} as a priority for ${personaConfig.title}s. Would value your perspective.`,
      `Quick question about ${company.name}'s approach to ${signalType.toLowerCase()}. Helping similar ${company.industry.toLowerCase()} companies with this challenge.`
    ];

    return messages[Math.floor(Math.random() * messages.length)];
  };

  const generateFollowUpSubject = (company, signal) => {
    const signalType = formatSignalType(signal.type);
    return `Last attempt: ${company.name} ${signalType} insights`;
  };

  const generateFollowUpEmail = (company, persona, signal) => {
    const personaConfig = getPersonaConfig(persona);
    const signalType = formatSignalType(signal.type);

    return `Hi there,

I reached out a couple of times about ${company.name}'s ${signalType.toLowerCase()} situation but haven't heard back.

I understand you're busy, but this is likely on your radar as a ${personaConfig.title}.

If the timing isn't right, no problem. If it is, I have some specific insights about how other ${company.industry.toLowerCase()} companies are handling this.

Quick 15-minute call to share what I'm seeing?

If not, I'll leave you alone.

Thanks,
[Your Name]
INP² Security Solutions`;
  };

  const markTouchComplete = (sequenceId, touchId) => {
    const completedAt = new Date().toISOString();
    let touchedSequence = null;
    let touchedTouch = null;

    setSequences(prev => prev.map(seq => {
      if (seq.id !== sequenceId) return seq;

      touchedSequence = seq;
      return {
        ...seq,
        touches: seq.touches.map(touch => {
          if (touch.id !== touchId) return touch;
          touchedTouch = touch;
          return {
            ...touch,
            completed: true,
            completedAt,
            status: 'completed'
          };
        })
      };
    }));

    if (touchedSequence && touchedTouch) {
      appendActivityEvent({
        category: 'sequence',
        companyId: touchedSequence.companyId,
        companyName: touchedSequence.companyName,
        title: 'Sequence touch completed',
        detail: touchedTouch.title
      });
    }
  };

  const cancelSequence = (sequenceId) => {
    const sequence = sequences.find(seq => seq.id === sequenceId);
    setSequences(prev => prev.filter(seq => seq.id !== sequenceId));

    // Remove sequence from company
    if (sequence) {
      setCompanies(prev => prev.map(c => {
        if (c.id === sequence.companyId) {
          const { activeSequence, sequenceStartDate, ...rest } = c;
          return rest;
        }
        return c;
      }));
      appendActivityEvent({
        category: 'sequence',
        companyId: sequence.companyId,
        companyName: sequence.companyName,
        title: 'Sequence cancelled',
        detail: sequence.persona
      });
    }

    alert('Sequence cancelled');
  };

  const getActiveSequenceForCompany = (companyId) => {
    return sequences.find(seq => seq.companyId === companyId && seq.status === 'active');
  };

  const getDueTouches = () => {
    const now = new Date();
    const dueTouches = [];

    sequences.forEach(sequence => {
      sequence.touches.forEach(touch => {
        if (!touch.completed && new Date(touch.dueDate) <= now) {
          dueTouches.push({
            ...touch,
            sequenceId: sequence.id,
            companyName: sequence.companyName
          });
        }
      });
    });

    return dueTouches.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  };

  async function generateRealLeads(source = 'apollo') {
    const setFlag = source === 'news' ? setLoadingNews : setLoadingApollo;
    setFlag(true);
    try {
      const criteria = {
        industry: filterIndustry !== 'all' ? filterIndustry : 'Finance',
        minEmployees: 50,
        maxEmployees: 1000,
      };

      const result = source === 'news'
        ? await netlifyAPI.fetchNewsLeads(criteria)
        : await netlifyAPI.fetchLeads(criteria);

      if (result?.success && Array.isArray(result.leads)) {
        const leads = result.leads.map((lead) => decorateLeadWithMeta(lead, result.meta));
        setCompanies(leads);
        if (leads.length) setSelectedCompany(leads[0]);
        setApiConnected(true);
        appendActivityEvent({
          category: 'lead_refresh',
          title: `${source === 'news' ? 'News' : 'Apollo'} leads refreshed`,
          detail: `${leads.length} leads from ${result.meta?.provider || result.source || source}`
        });
        console.log(`✅ fetched ${leads.length} leads from ${result.source || source}`);
      } else {
        throw new Error('No leads returned from API');
      }
    } catch (e) {
      console.error('API call failed:', e);
      alert(`API call failed: ${e.message}. Verify APOLLO_LAMINAR_API_KEY is set.`);
    } finally {
      setFlag(false);
    }
  }

  useEffect(() => {
    const hydrateState = async () => {
      try {
        const [leadState, segmentState, sequenceState, outreachState, laminarState, health] = await Promise.all([
          loadLeadState(),
          loadSegmentState(),
          loadSequenceState(),
          loadOutreachState(),
          loadLaminarState(),
          netlifyAPI.getIntegrationHealth().catch(() => null)
        ]);

        const storedCompanies = Array.isArray(leadState?.companies) ? leadState.companies.map((company) =>
          decorateLeadWithMeta(company, company.sourceMeta || {})
        ) : [];

        let companiesToUse = storedCompanies;
        let autoFetched = false;
        if (!storedCompanies.length) {
          try {
            const result = await netlifyAPI.fetchLeads({ scoringProfile: 'commodity_trading' });
            if (result?.success && Array.isArray(result.leads) && result.leads.length > 0) {
              companiesToUse = result.leads.map((lead) => decorateLeadWithMeta(lead, result.meta));
              autoFetched = true;
            } else {
              companiesToUse = [];
            }
          } catch (e) {
            console.warn('Laminar leads auto-fetch failed on startup:', e.message);
            companiesToUse = [];
          }
        }

        const selectedFromState = leadState?.selectedCompanyId
          ? companiesToUse.find((company) => company.id === leadState.selectedCompanyId) || companiesToUse[0]
          : companiesToUse[0];

        setCompanies(companiesToUse);
        setSelectedCompany(selectedFromState || null);
        setSavedSegments(segmentState?.savedSegments || []);
        setActiveSegment(segmentState?.activeSegment || null);
        setSequences(sequenceState?.sequences || []);
        setSavedOutreachTemplates(outreachState?.templates || []);
        setVariantsByCompany(outreachState?.variantsByCompany || {});
        setActivityTimeline(leadState?.activityTimeline || []);
        setLastEmailResult(leadState?.lastEmailResult || null);
        setIntegrationHealth(health?.providers || []);
        setApiConnected(companiesToUse.length > 0);
        if (autoFetched) setCurrentView('laminar');
        if (laminarState) {
          if (laminarState.contactsTabSegment) setContactsTabSegment(laminarState.contactsTabSegment);
          if (laminarState.pilotViewSegment !== undefined) setPilotViewSegment(laminarState.pilotViewSegment);
          if (laminarState.prospectorSegment !== undefined) setProspectorSegment(laminarState.prospectorSegment);
          if (laminarState.sortBySegment) setSortBySegment((prev) => ({ ...prev, ...laminarState.sortBySegment }));
        }
      } catch (error) {
        console.error('Failed to hydrate persisted state:', error);
        setCompanies([]);
        setSelectedCompany(null);
      } finally {
        setStorageHydrated(true);
      }
    };

    hydrateState();
  }, []);

  useEffect(() => {
    if (!storageHydrated) {
      return;
    }

    saveLeadState({
      companies,
      selectedCompanyId: selectedCompany?.id || null,
      activityTimeline,
      lastEmailResult
    }).catch((error) => {
      console.error('Failed to persist lead state:', error);
    });
  }, [companies, selectedCompany, activityTimeline, lastEmailResult, storageHydrated]);

  useEffect(() => {
    if (!storageHydrated) {
      return;
    }

    saveSegmentState({
      savedSegments,
      activeSegment
    }).catch((error) => {
      console.error('Failed to persist segment state:', error);
    });
  }, [savedSegments, activeSegment, storageHydrated]);

  useEffect(() => {
    if (!storageHydrated) {
      return;
    }

    saveSequenceState({
      sequences
    }).catch((error) => {
      console.error('Failed to persist sequence state:', error);
    });
  }, [sequences, storageHydrated]);

  useEffect(() => {
    if (!storageHydrated) {
      return;
    }

    saveOutreachState({
      templates: savedOutreachTemplates,
      variantsByCompany,
      history: flattenOutreachHistory(companies)
    }).catch((error) => {
      console.error('Failed to persist outreach state:', error);
    });
  }, [savedOutreachTemplates, variantsByCompany, companies, storageHydrated]);

  useEffect(() => {
    if (!storageHydrated) {
      return;
    }

    saveLaminarState({
      contactsTabSegment,
      pilotViewSegment,
      prospectorSegment,
      sortBySegment
    }).catch((error) => {
      console.error('Failed to persist laminar state:', error);
    });
  }, [contactsTabSegment, pilotViewSegment, prospectorSegment, sortBySegment, storageHydrated]);

  const getScoreColor = (score) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'Critical': return 'bg-red-100 text-red-800';
      case 'High': return 'bg-orange-100 text-orange-800';
      case 'Medium': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Memoized filtered companies for performance
  const filteredCompanies = useMemo(() => {
    return companies.filter(
      (company) =>
        company.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        (filterIndustry === 'all' || company.industry === filterIndustry) &&
        (filterState === 'all' || extractStateFromLocation(company.location) === filterState)
    );
  }, [companies, searchTerm, filterIndustry, filterState]);

  // Memoized unique values for better performance
  const availableStates = useMemo(() => getUniqueStates(companies), [companies]);
  const availableIndustries = useMemo(() => getUniqueIndustries(companies), [companies]);

  useEffect(() => {
    if (!selectedCompany?.id) {
      return;
    }

    const storedVariants = variantsByCompany[selectedCompany.id];
    if (Array.isArray(storedVariants) && storedVariants.length > 0) {
      setOutreachVariants(storedVariants);
      setSelectedVariant((current) => Math.min(current, storedVariants.length - 1));
      return;
    }

    setOutreachVariants([]);
    setSelectedVariant(0);
  }, [selectedCompany?.id, variantsByCompany]);

  if (!storageHydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-lg font-semibold text-gray-700">Loading trade finance leads…</p>
          <p className="text-sm text-gray-500">Connecting to Apollo Laminar</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <img
            src="/inp2-logo.png"
            alt="INP² Security Logo"
            className="w-12 h-12 object-contain"
            onError={(e) => {
              console.log('Logo failed to load from:', e.currentTarget.src);
              e.currentTarget.style.display = 'none';
            }}
          />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">INP² Trade Finance Lead Dashboard</h1>
            <p className="text-sm text-gray-600">INP² Security Solutions</p>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          {apiConnected && (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <Globe className="w-3 h-3 mr-1" />
              API Connected
            </Badge>
          )}

          {/* View Switcher */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <Button
              variant={currentView === 'executive' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setCurrentView('executive')}
              className="flex items-center gap-2"
            >
              <Crown className="w-4 h-4" />
              Executive
            </Button>
            <Button
              variant={currentView === 'detailed' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setCurrentView('detailed')}
              className="flex items-center gap-2"
            >
              <List className="w-4 h-4" />
              Detailed
            </Button>
            <Button
              variant={currentView === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setCurrentView('kanban')}
              className="flex items-center gap-2"
            >
              <Calendar className="w-4 h-4" />
              Pipeline
            </Button>
            <Button
              variant={currentView === 'laminar' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setCurrentView('laminar')}
              className="flex items-center gap-2"
            >
              <Briefcase className="w-4 h-4" />
              Laminar Pilot
            </Button>
          </div>

          <Button className="bg-green-600 hover:bg-green-700" onClick={() => setShowLeadGen(!showLeadGen)}>
            <Users className="w-4 h-4 mr-2" />
            Generate Leads
          </Button>

          <Button className="bg-purple-600 hover:bg-purple-700" onClick={() => generateRealLeads('apollo')} disabled={loadingApollo}>
            {loadingApollo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Globe className="w-4 h-4 mr-2" />}
            Apollo API
          </Button>

          <Button className="bg-red-600 hover:bg-red-700" onClick={() => generateRealLeads('news')} disabled={loadingNews}>
            {loadingNews ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <AlertCircle className="w-4 h-4 mr-2" />}
            Security News
          </Button>

          <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setShowBulkEmailModal(true)}>
            <Mail className="w-4 h-4 mr-2" />
            Bulk Email
          </Button>
          <Button variant="outline" onClick={() => setShowAnalyticsModal(true)}>
            <TrendingUp className="w-4 h-4 mr-2" />
            Analytics
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 bg-white">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Integration Health</CardTitle>
              <p className="text-sm text-gray-600">Clear status for live providers, fallbacks, and storage backends.</p>
            </div>
            <Button variant="outline" size="sm" onClick={refreshIntegrationHealth} disabled={healthLoading}>
              {healthLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {integrationHealth.map((provider) => (
              <div key={provider.name} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">{provider.name}</p>
                  <Badge
                    variant="outline"
                    className={
                      provider.mode === 'live'
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : provider.mode === 'fallback' || provider.mode === 'simulated'
                          ? 'border-amber-300 bg-amber-50 text-amber-700'
                          : 'border-slate-300 bg-slate-100 text-slate-700'
                    }
                  >
                    {provider.mode}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-gray-600">
                  {provider.configured ? 'Configured' : 'Not configured'} • {provider.live ? 'Live ready' : 'Fallback or mock only'}
                </p>
              </div>
            ))}
            {integrationHealth.length === 0 && (
              <div className="col-span-full rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Integration status is unavailable right now. The dashboard will continue using labeled fallbacks where configured.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {activityTimeline.slice(0, 6).map((event) => (
              <div key={event.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">{event.title}</p>
                  <p className="text-xs text-gray-600">
                    {[event.companyName, event.detail].filter(Boolean).join(' • ')}
                  </p>
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(event.timestamp).toLocaleDateString()}
                </span>
              </div>
            ))}
            {activityTimeline.length === 0 && (
              <p className="text-sm text-gray-600">No persisted activity yet. Lead refreshes, outreach, meetings, and sequences will appear here.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {showLeadGen && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="text-green-800">Lead Generation Methods</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card className="bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">API Integration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">ZoomInfo/Apollo</h4>
                    <p className="text-xs text-gray-600">Search companies by industry, size, tech stack</p>
                    <Input placeholder="Industry keyword..." className="text-sm" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">LinkedIn Sales Navigator</h4>
                    <p className="text-xs text-gray-600">Target decision makers and companies</p>
                    <Input placeholder="Job title search..." className="text-sm" />
                  </div>
                  <Button size="sm" className="w-full" onClick={() => generateRealLeads('apollo')} disabled={loadingApollo}>
                    {loadingApollo ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : 'Connect Apollo'}
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Intelligence Gathering</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">News Monitoring</h4>
                    <p className="text-xs text-gray-600">Track security incidents, funding, expansions</p>
                    <Input placeholder="Google Alerts keywords..." className="text-sm" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Job Posting Analysis</h4>
                    <p className="text-xs text-gray-600">Companies hiring security professionals</p>
                    <Input placeholder="Job board scraper..." className="text-sm" />
                  </div>
                  <Button size="sm" className="w-full" onClick={() => generateRealLeads('news')} disabled={loadingNews}>
                    {loadingNews ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : 'Start News Monitor'}
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Tech Stack Analysis</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button size="sm" className="w-full" onClick={runTechAnalysis} disabled={analysisLoading}>
                    {analysisLoading ? 'Analyzing...' : 'Analyze Tech'}
                  </Button>

                  {analysisError && <p className="text-sm text-red-600 mt-2">Error: {analysisError}</p>}

                  {analysis && (
                    <div className="mt-4 space-y-3 text-sm">
                      <div>
                        <h4 className="font-medium">Summary</h4>
                        <p className="text-gray-700">{analysis.summary}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <h4 className="font-medium">Front-end</h4>
                          <div className="flex flex-wrap gap-2">
                            {(analysis.frontEnd || []).map((t, i) => (
                              <Badge key={i} variant="secondary">{t}</Badge>
                            ))}
                          </div>
                        </div>
                        <div>
                          <h4 className="font-medium">Back-end</h4>
                          <div className="flex flex-wrap gap-2">
                            {(analysis.backEnd || []).map((t, i) => (
                              <Badge key={i} variant="secondary">{t}</Badge>
                            ))}
                          </div>
                        </div>
                        <div>
                          <h4 className="font-medium">CMS</h4>
                          <div className="flex flex-wrap gap-2">
                            {(analysis.cms || []).map((t, i) => (
                              <Badge key={i} variant="secondary">{t}</Badge>
                            ))}
                          </div>
                        </div>
                        <div>
                          <h4 className="font-medium">Hosting</h4>
                          <div className="flex flex-wrap gap-2">
                            {(analysis.hosting || []).map((t, i) => (
                              <Badge key={i} variant="secondary">{t}</Badge>
                            ))}
                          </div>
                        </div>
                        <div className="col-span-2">
                          <h4 className="font-medium">Analytics</h4>
                          <div className="flex flex-wrap gap-2">
                            {(analysis.analytics || []).map((t, i) => (
                              <Badge key={i} variant="outline">{t}</Badge>
                            ))}
                          </div>
                        </div>
                        <div className="col-span-2">
                          <h4 className="font-medium flex items-center gap-2">
                            <Shield className="w-4 h-4" /> Security Tools & Signals
                          </h4>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {(analysis.securityTools || []).map((t, i) => (
                              <Badge key={i} variant="outline">{t}</Badge>
                            ))}
                          </div>
                          <ul className="list-disc ml-5 mt-2 text-gray-700">
                            {(analysis.signals || []).map((s, i) => <li key={i}>{s}</li>)}
                          </ul>
                        </div>
                      </div>

                      <div className="mt-2">
                        <span className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                          Confidence: {analysis.confidence ?? 0}/100
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Buying Intent Signals</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Content Consumption</h4>
                    <p className="text-xs text-gray-600">Track security content engagement</p>
                    <div className="flex gap-2">
                      <Badge variant="outline">Whitepapers</Badge>
                      <Badge variant="outline">Webinars</Badge>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Search Behavior</h4>
                    <p className="text-xs text-gray-600">Companies researching security solutions</p>
                    <div className="flex gap-2">
                      <Badge variant="outline">G2 Reviews</Badge>
                      <Badge variant="outline">Comparison Pages</Badge>
                    </div>
                  </div>
                  <Button size="sm" className="w-full">Track Intent</Button>
                </CardContent>
              </Card>

              <Card className="bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Data Import</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">CSV Upload</h4>
                    <p className="text-xs text-gray-600">Import existing prospect lists</p>
                    <Input type="file" accept=".csv" className="text-sm" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">CRM Sync</h4>
                    <p className="text-xs text-gray-600">Salesforce, HubSpot integration</p>
                    <Button size="sm" variant="outline" className="w-full">Connect CRM</Button>
                  </div>
                  <Button size="sm" className="w-full">Import Data</Button>
                </CardContent>
              </Card>

              <Card className="bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Event & Trigger Monitoring</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Funding Events</h4>
                    <p className="text-xs text-gray-600">Companies that recently raised capital</p>
                    <Input placeholder="Funding amount range..." className="text-sm" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Security Incidents</h4>
                    <p className="text-xs text-gray-600">Breach notifications, compliance issues</p>
                    <div className="flex gap-2">
                      <Badge variant="outline">Breaches</Badge>
                      <Badge variant="outline">Compliance</Badge>
                    </div>
                  </div>
                  <Button size="sm" className="w-full">Monitor Events</Button>
                </CardContent>
              </Card>
            </div>

            <div className="mt-6 p-4 bg-white border border-purple-200 rounded-lg">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-purple-800">Apollo Prospector</h3>
                  <p className="text-xs text-gray-600">Keyword company search, title-based people prospecting, and single-person enrichment.</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">Scoring profile</label>
                  <select
                    className="px-3 py-2 border rounded-md text-sm"
                    value={apolloProfile}
                    onChange={(e) => setApolloProfile(e.target.value)}
                  >
                    <option value="cybersecurity">Cybersecurity (APOLLO_API_KEY)</option>
                    <option value="commodity_trading">Commodity Trading (APOLLO_LAMINAR_API_KEY)</option>
                  </select>
                </div>
              </div>

              {apolloError && (
                <div className="mb-3 p-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded">
                  {apolloError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-white">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Find Companies (keywords)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-xs text-gray-600">
                      Comma-separated keywords (e.g. <em>commodity trading, oil trading, midstream</em>).
                    </p>
                    <Textarea
                      placeholder="commodity trading, oil trading, trade finance"
                      value={apolloKeywordsInput}
                      onChange={(e) => setApolloKeywordsInput(e.target.value)}
                      className="text-sm"
                      rows={2}
                    />
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={runApolloCompanySearch}
                      disabled={apolloLoading.companies}
                    >
                      {apolloLoading.companies
                        ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Searching...</>
                        : 'Search Companies'}
                    </Button>
                    {apolloCompanyResults && (
                      <div className="text-xs text-gray-700 mt-2">
                        <Badge variant="outline" className="mr-2">{apolloCompanyResults.source}</Badge>
                        {apolloCompanyResults.leads?.length || 0} companies added to lead list
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-white">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Find People (titles + domains)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {apolloProfile === 'commodity_trading' && (
                      <div className="rounded border border-purple-200 bg-purple-50 p-2 space-y-2">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-purple-900">Laminar segment:</label>
                          <select
                            className="flex-1 px-2 py-1 border rounded text-xs"
                            value={prospectorSegment || ''}
                            onChange={(e) => setProspectorSegment(e.target.value || null)}
                          >
                            <option value="">All segments</option>
                            {LAMINAR_SEGMENT_ORDER.map((segId) => (
                              <option key={segId} value={segId}>{LAMINAR_SEGMENTS[segId].label}</option>
                            ))}
                          </select>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-xs"
                          onClick={() => {
                            const titles = prospectorSegment
                              ? LAMINAR_SEGMENTS[prospectorSegment].titles
                              : getAllLaminarTitles();
                            const domains = prospectorSegment
                              ? LAMINAR_SEGMENTS[prospectorSegment].domains
                              : getAllLaminarDomains();
                            setApolloTitlesInput(titles.join(', '));
                            setApolloDomainsInput(domains.join(', '));
                          }}
                        >
                          Load Laminar titles + domains
                        </Button>
                      </div>
                    )}
                    <p className="text-xs text-gray-600">Job titles (comma-separated):</p>
                    <Textarea
                      placeholder="CFO, Treasurer, Head of Trade Finance"
                      value={apolloTitlesInput}
                      onChange={(e) => setApolloTitlesInput(e.target.value)}
                      className="text-sm"
                      rows={2}
                    />
                    <p className="text-xs text-gray-600">Target domains (optional, comma-separated):</p>
                    <Textarea
                      placeholder="mercuria.com, vitol.com, gunvorgroup.com"
                      value={apolloDomainsInput}
                      onChange={(e) => setApolloDomainsInput(e.target.value)}
                      className="text-sm"
                      rows={2}
                    />
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={runApolloPeopleSearch}
                      disabled={apolloLoading.people}
                    >
                      {apolloLoading.people
                        ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Searching...</>
                        : 'Search People'}
                    </Button>
                    {apolloPeopleResults && (
                      <div className="mt-2">
                        <div className="text-xs text-gray-700 mb-2">
                          <Badge variant="outline" className="mr-2">{apolloPeopleResults.source}</Badge>
                          {apolloPeopleResults.people?.length || 0} people found
                        </div>
                        <div className="max-h-64 overflow-y-auto space-y-2">
                          {(apolloPeopleResults.people || []).map((p, i) => (
                            <div key={i} className="p-2 bg-gray-50 border rounded">
                              <div className="flex items-center justify-between">
                                <div className="text-sm font-medium">{p.name || 'Unknown'}</div>
                                <Badge variant={(p.relevanceScore || p.score) >= 80 ? 'default' : 'secondary'}>
                                  {p.relevanceScore || p.score || 0} ({p.priority || p.roleCategory || 'Unranked'})
                                </Badge>
                              </div>
                              <div className="text-xs text-gray-600">
                                {p.title} {p.company ? `· ${p.company}` : ''}
                              </div>
                              {(p.roleCategory || p.priorityRank) && (
                                <div className="text-xs text-gray-500">
                                  {[p.roleCategory ? `Role: ${p.roleCategory.replace('_', ' ')}` : null, p.priorityRank ? `Rank: ${p.priorityRank}` : null].filter(Boolean).join(' · ')}
                                </div>
                              )}
                              {p.email && <div className="text-xs text-blue-700 truncate">{p.email}</div>}
                              {p.scoreReasons?.length > 0 && (
                                <ul className="text-xs text-gray-500 list-disc ml-4 mt-1">
                                  {p.scoreReasons.map((r, j) => <li key={j}>{r}</li>)}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-white">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Enrich a Person</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Input
                      placeholder="First name"
                      className="text-sm"
                      value={apolloEnrichInput.firstName}
                      onChange={(e) => setApolloEnrichInput(prev => ({ ...prev, firstName: e.target.value }))}
                    />
                    <Input
                      placeholder="Last name"
                      className="text-sm"
                      value={apolloEnrichInput.lastName}
                      onChange={(e) => setApolloEnrichInput(prev => ({ ...prev, lastName: e.target.value }))}
                    />
                    <Input
                      placeholder="Organization name"
                      className="text-sm"
                      value={apolloEnrichInput.organizationName}
                      onChange={(e) => setApolloEnrichInput(prev => ({ ...prev, organizationName: e.target.value }))}
                    />
                    <Input
                      placeholder="LinkedIn URL"
                      className="text-sm"
                      value={apolloEnrichInput.linkedinUrl}
                      onChange={(e) => setApolloEnrichInput(prev => ({ ...prev, linkedinUrl: e.target.value }))}
                    />
                    <Input
                      placeholder="Email"
                      className="text-sm"
                      value={apolloEnrichInput.email}
                      onChange={(e) => setApolloEnrichInput(prev => ({ ...prev, email: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={runApolloPersonEnrich}
                      disabled={apolloLoading.enrich}
                    >
                      {apolloLoading.enrich
                        ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Enriching...</>
                        : 'Enrich Person'}
                    </Button>
                    {apolloEnrichResult?.person && (
                      <div className="mt-2 p-2 bg-gray-50 border rounded">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium">{apolloEnrichResult.person.name}</div>
                          <Badge variant={(apolloEnrichResult.person.relevanceScore || apolloEnrichResult.person.score) >= 80 ? 'default' : 'secondary'}>
                            {apolloEnrichResult.person.relevanceScore || apolloEnrichResult.person.score || 0} ({apolloEnrichResult.person.priority || apolloEnrichResult.person.roleCategory || 'Unranked'})
                          </Badge>
                        </div>
                        <div className="text-xs text-gray-600">
                          {apolloEnrichResult.person.title} {apolloEnrichResult.person.company ? `· ${apolloEnrichResult.person.company}` : ''}
                        </div>
                        {(apolloEnrichResult.person.roleCategory || apolloEnrichResult.person.priorityRank) && (
                          <div className="text-xs text-gray-500">
                            {[apolloEnrichResult.person.roleCategory ? `Role: ${apolloEnrichResult.person.roleCategory.replace('_', ' ')}` : null, apolloEnrichResult.person.priorityRank ? `Rank: ${apolloEnrichResult.person.priorityRank}` : null].filter(Boolean).join(' · ')}
                          </div>
                        )}
                        {apolloEnrichResult.person.email && (
                          <div className="text-xs text-blue-700">{apolloEnrichResult.person.email}</div>
                        )}
                        {(apolloEnrichResult.person.linkedin || apolloEnrichResult.person.linkedin_url) && (
                          <a
                            href={apolloEnrichResult.person.linkedin || apolloEnrichResult.person.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 underline"
                          >
                            LinkedIn
                          </a>
                        )}
                        <Badge variant="outline" className="mt-1">{apolloEnrichResult.source}</Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h4 className="font-medium text-blue-800 mb-2">💡 Pro Tips for Lead Generation:</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• <strong>Timing is everything:</strong> Target companies 30-90 days after funding rounds</li>
                <li>• <strong>Job posting intelligence:</strong> Companies hiring treasury, settlement, or trade finance roles are actively investing</li>
                <li>• <strong>Technology triggers:</strong> Companies migrating to cloud often need new security solutions</li>
                <li>• <strong>Compliance deadlines:</strong> Track upcoming regulatory requirements (SOX, GDPR, etc.)</li>
                <li>• <strong>Industry events:</strong> Follow RSA, Black Hat attendee lists for active prospects</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-4 items-center bg-white p-4 rounded-lg shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search companies..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          className="px-4 py-2 border rounded-md"
          value={filterIndustry}
          onChange={(e) => setFilterIndustry(e.target.value)}
        >
          <option value="all">All Industries</option>
          {availableIndustries.map(industry => (
            <option key={industry} value={industry}>{industry}</option>
          ))}
        </select>

        <select
          className="px-4 py-2 border rounded-md"
          value={filterState}
          onChange={(e) => setFilterState(e.target.value)}
        >
          <option value="all">All States</option>
          {availableStates.map(state => (
            <option key={state} value={state}>{state}</option>
          ))}
        </select>

        <Button
          variant="outline"
          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
        >
          <Filter className="w-4 h-4 mr-2" />
          More Filters
        </Button>

        {/* Active Filter Indicators */}
        <div className="flex gap-2">
          {(filterIndustry !== 'all' || filterState !== 'all' || searchTerm) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterIndustry('all');
                setFilterState('all');
                setSearchTerm('');
              }}
              className="text-xs"
            >
              Clear All
            </Button>
          )}

          <span className="text-sm text-gray-600 flex items-center">
            {filteredCompanies.length} results
          </span>
        </div>
      </div>

      {/* Advanced Filters Panel */}
      {showAdvancedFilters && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Advanced Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Regional Grouping */}
              <div>
                <label className="block text-sm font-medium mb-2">Region</label>
                <select
                  className="w-full px-3 py-2 border rounded-md"
                  value={filterState}
                  onChange={(e) => setFilterState(e.target.value)}
                >
                  <option value="all">All Regions</option>
                  <option value="west-coast">West Coast (CA, WA)</option>
                  <option value="east-coast">East Coast (NY, MA)</option>
                  <option value="southwest">Southwest (TX, CO)</option>
                  <option value="southeast">Southeast (GA)</option>
                  <option value="midwest">Midwest (IL)</option>
                </select>
              </div>

              {/* Priority Level */}
              <div>
                <label className="block text-sm font-medium mb-2">Priority Level</label>
                <select className="w-full px-3 py-2 border rounded-md">
                  <option value="all">All Priorities</option>
                  <option value="critical">Critical Only</option>
                  <option value="high">High & Critical</option>
                  <option value="medium-plus">Medium & Above</option>
                </select>
              </div>

              {/* Score Range */}
              <div>
                <label className="block text-sm font-medium mb-2">Lead Score Range</label>
                <select className="w-full px-3 py-2 border rounded-md">
                  <option value="all">All Scores</option>
                  <option value="80-100">80-100 (Critical)</option>
                  <option value="60-79">60-79 (High)</option>
                  <option value="40-59">40-59 (Medium)</option>
                  <option value="0-39">0-39 (Low)</option>
                </select>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilterIndustry('all');
                  setFilterState('all');
                  setSearchTerm('');
                }}
              >
                Reset All Filters
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvancedFilters(false)}
              >
                Close
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Saved Segments Section */}
      {savedSegments.length > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-blue-800 flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Saved Segments ({savedSegments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {savedSegments.map((segment) => (
                <div
                  key={segment.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                    activeSegment === segment.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                  }`}
                  onClick={() => loadSegment(segment)}
                >
                  <span className="text-sm font-medium">{segment.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {segment.count}
                  </Badge>
                  <span className="text-xs opacity-75">
                    Avg: {segment.avgScore}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSegment(segment.id);
                    }}
                    className="text-red-500 hover:text-red-700 ml-1"
                    title="Delete segment"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter Controls and Save Segment */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-between items-center mb-4">
            <div className="flex gap-4 items-center">
              <Input
                placeholder="Search companies..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64"
              />
              <select
                value={filterIndustry}
                onChange={(e) => setFilterIndustry(e.target.value)}
                className="border rounded px-3 py-2"
              >
                <option value="all">All Industries</option>
                {getUniqueIndustries(companies).map(industry => (
                  <option key={industry} value={industry}>{industry}</option>
                ))}
              </select>
              <select
                value={filterState}
                onChange={(e) => setFilterState(e.target.value)}
                className="border rounded px-3 py-2"
              >
                <option value="all">All States</option>
                {getUniqueStates(companies).map(state => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSaveSegmentModal(true)}
                disabled={!searchTerm && filterIndustry === 'all' && filterState === 'all'}
              >
                <Filter className="w-4 h-4 mr-2" />
                Save Segment
              </Button>
              {activeSegment && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchTerm('');
                    setFilterIndustry('all');
                    setFilterState('all');
                    setActiveSegment(null);
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </div>
          <div className="text-sm text-gray-600">
            Showing {filteredCompanies.length} of {companies.length} companies
            {activeSegment && (
              <span className="ml-2 text-blue-600 font-medium">
                (Using segment: {savedSegments.find(s => s.id === activeSegment)?.name})
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Executive Dashboard View */}
      {currentView === 'executive' ? (
        <ExecutiveDashboard
          companies={filteredCompanies}
          onCompanySelect={setSelectedCompany}
          netlifyAPI={netlifyAPI}
        />
      ) : currentView === 'kanban' ? (
        /* Kanban Pipeline View */
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Sales Pipeline</h3>
          <div className="grid grid-cols-4 gap-4">
            {getKanbanColumns().map((column) => (
              <div
                key={column.status}
                className={`bg-gray-50 rounded-lg p-4 min-h-[600px] transition-colors ${
                  dragOverColumn === column.status ? 'bg-blue-100 border-2 border-blue-300' : 'border border-gray-200'
                }`}
                onDragOver={(e) => handleDragOver(e, column.status)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, column.status)}
              >
                {/* Column Header */}
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-semibold text-gray-800">{column.status}</h4>
                    <Badge variant="secondary">{column.count}</Badge>
                  </div>
                  <div className="text-xs text-gray-600">
                    Avg Score: {column.avgScore || 0}
                  </div>
                </div>

                {/* Company Cards */}
                <div className="space-y-3">
                  {column.companies.map((company) => (
                    <div
                      key={company.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, company)}
                      className={`bg-white p-3 rounded border shadow-sm cursor-move transition-all hover:shadow-md ${
                        draggedCompany?.id === company.id ? 'opacity-50' : ''
                      }`}
                      onClick={() => setSelectedCompany(company)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h5 className="font-medium text-sm truncate">{company.name}</h5>
                        <div className={`w-3 h-3 rounded-full ${getScoreColor(company.leadScore)}`} />
                      </div>
                      <div className="text-xs text-gray-600 mb-2">
                        {company.industry} • {company.employees} employees
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-medium">{company.leadScore}/100</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-[10px] ${getSourceBadge(company.sourceMeta).className}`}>
                            {getSourceBadge(company.sourceMeta).label}
                          </Badge>
                          <Badge className={getPriorityColor(company.priority)} variant="outline">
                            {company.priority}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Drop Zone Indicator */}
                {draggedCompany && dragOverColumn === column.status && draggedCompany.status !== column.status && (
                  <div className="mt-3 p-3 border-2 border-dashed border-blue-400 rounded bg-blue-50 text-center text-blue-600 text-sm">
                    Drop here to move to {column.status}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : currentView === 'laminar' ? (
        <LaminarPilotBoard
          companies={filteredCompanies}
          sortBySegment={sortBySegment}
          onSortChange={(segId, mode) => setSortBySegment((prev) => ({ ...prev, [segId]: mode }))}
          refreshingSegments={refreshingSegments}
          refreshAllProgress={refreshAllProgress}
          onRefreshSegment={refreshSegment}
          onRefreshAll={refreshAllSegments}
          onViewCompany={(company) => { setSelectedCompany(company); setCurrentView('detailed'); }}
          onDraftEmail={openEmailModal}
          onSchedule={openCalendarModal}
          onAddToSequence={(company) => {
            const variant = (variantsByCompany?.[company.id] || [])[selectedVariant || 0] || {
              persona: 'CFO',
              tone: 'professional',
              subject: `Working capital review for ${company.name}`,
              body: `Hi {name}, exploring a 20-minute call on settlement workflow.`
            };
            addToSequence(company, variant);
          }}
          getRoleCategoryLabel={getRoleCategoryLabel}
        />
      ) : (
        /* Detailed View */
        filteredCompanies.length > 0 && (
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-4 space-y-3">
            <h3 className="text-lg font-semibold text-gray-900">Leads ({filteredCompanies.length})</h3>
            {filteredCompanies.map((company) => (
              <Card
                key={company.id}
                className={`cursor-pointer transition-all hover:shadow-md ${selectedCompany?.id === company.id ? 'ring-2 ring-blue-500' : ''}`}
                onClick={() => setSelectedCompany(company)}
              >
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-semibold text-sm">{company.name}</h4>
                        <Badge variant="outline" className={`mt-2 text-[10px] ${getSourceBadge(company.sourceMeta).className}`}>
                          {getSourceBadge(company.sourceMeta).label}
                        </Badge>
                      </div>
                      <Badge className={getPriorityColor(company.priority)}>
                        {company.priority}
                      </Badge>
                    </div>
                  <p className="text-xs text-gray-600 mb-2">
                    {company.industry} • {company.employees} employees
                  </p>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${getScoreColor(company.leadScore)}`} />
                      <span className="text-xs font-medium">{company.leadScore}/100</span>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {company.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="col-span-8">
            {selectedCompany && (
              <div className="space-y-6">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h2 className="text-2xl font-bold">{selectedCompany.name}</h2>
                        <p className="text-gray-600">{selectedCompany.industry} • {selectedCompany.location}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <Badge variant="outline" className={getSourceBadge(selectedCompany.sourceMeta).className}>
                            {getSourceBadge(selectedCompany.sourceMeta).label}
                          </Badge>
                          {selectedCompany.sourceMeta?.provider && (
                            <span className="text-xs text-gray-500">{selectedCompany.sourceMeta.provider}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right relative">
                        <div className="flex items-center gap-2">
                          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${getScoreColor(selectedCompany.leadScore)} text-white`}>
                            <Star className="w-4 h-4" />
                            {selectedCompany.leadScore}/100
                          </div>
                          <button
                            onClick={() => setShowScoreExplanation(!showScoreExplanation)}
                            className="text-xs text-blue-600 hover:text-blue-800 underline"
                            title="Explain Score"
                          >
                            Explain
                          </button>
                        </div>
                        {showScoreExplanation && renderScoreExplanation(selectedCompany)}
                      </div>
                    </div>

                    {getSourceWarning(selectedCompany.sourceMeta) && (
                      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        {getSourceWarning(selectedCompany.sourceMeta)}
                      </div>
                    )}

                    <div className="grid grid-cols-4 gap-4 mb-4">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-gray-500" />
                        <span className="text-sm">{selectedCompany.employees} employees</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-gray-500" />
                        <span className="text-sm">{selectedCompany.revenue} revenue</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-gray-500" />
                        <a href={selectedCompany.website} className="text-sm text-blue-600 hover:underline">Website</a>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        <span className="text-sm">Last: {selectedCompany.lastContact || 'Never'}</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => openEmailModal(selectedCompany)}
                      >
                        <Mail className="w-4 h-4 mr-2" />
                        {lastEmailResult?.meta?.source === 'simulated' ? 'Simulate Send' : 'Send Email'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openCalendarModal(selectedCompany)}
                      >
                        <Calendar className="w-4 h-4 mr-2" />
                        Schedule Meeting
                      </Button>
                      <Button size="sm" variant="outline">
                        <Globe className="w-4 h-4 mr-2" />
                        LinkedIn
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Tabs defaultValue="overview" className="space-y-4">
                  <TabsList className="grid w-full grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="contacts">Contacts</TabsTrigger>
                    <TabsTrigger value="intelligence">Intelligence</TabsTrigger>
                    <TabsTrigger value="signals">Signals</TabsTrigger>
                    <TabsTrigger value="outreach">Outreach</TabsTrigger>
                    <TabsTrigger value="activity">Activity</TabsTrigger>
                    <TabsTrigger value="instructions">Instructions</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-4">
                    {/* Laminar AI-powered Decision Cards (commodity_trading context) */}
                    {((selectedCompany.contacts || []).some((c) => c.segment || c.sourceMeta?.segment) || selectedCompany.segment) && (
                      <LaminarDecisionCards company={selectedCompany} laminarAI={netlifyAPI.laminarAI.bind(netlifyAPI)} />
                    )}

                    {/* Static heuristic Decision Cards (cybersecurity context fallback) */}
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      {(() => {
                        const decisionCards = generateDecisionCards(selectedCompany);
                        return (
                          <>
                            <Card className="border-green-200 bg-green-50">
                              <CardHeader className="pb-3">
                                <CardTitle className="text-lg flex items-center gap-2 text-green-800">
                                  <TrendingUp className="w-5 h-5" />
                                  Why Now?
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <ul className="space-y-2">
                                  {decisionCards.whyNow.map((reason, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm text-green-700">
                                      <div className="w-2 h-2 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                                      {reason}
                                    </li>
                                  ))}
                                </ul>
                              </CardContent>
                            </Card>

                            <Card className="border-blue-200 bg-blue-50">
                              <CardHeader className="pb-3">
                                <CardTitle className="text-lg flex items-center gap-2 text-blue-800">
                                  <Target className="w-5 h-5" />
                                  What We'd Do First
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <ul className="space-y-2">
                                  {decisionCards.whatFirst.map((action, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm text-blue-700">
                                      <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                                      {action}
                                    </li>
                                  ))}
                                </ul>
                              </CardContent>
                            </Card>

                            <Card className="border-red-200 bg-red-50">
                              <CardHeader className="pb-3">
                                <CardTitle className="text-lg flex items-center gap-2 text-red-800">
                                  <AlertTriangle className="w-5 h-5" />
                                  Risks of Waiting
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <ul className="space-y-2">
                                  {decisionCards.risksWaiting.map((risk, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm text-red-700">
                                      <div className="w-2 h-2 rounded-full bg-red-500 mt-2 flex-shrink-0" />
                                      {risk}
                                    </li>
                                  ))}
                                </ul>
                              </CardContent>
                            </Card>
                          </>
                        );
                      })()}
                    </div>

                    {/* Health Meters */}
                    <Card className="mb-4">
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Shield className="w-5 h-5" />
                          Security Health Meters
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-3 gap-6">
                          {(() => {
                            const health = generateHealthMeters(selectedCompany);
                            return (
                              <>
                                {/* MFA/SSO Health */}
                                <div className="text-center">
                                  <div className="mb-3">
                                    <div className="relative w-16 h-16 mx-auto">
                                      <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
                                        <path
                                          d="M18 2.0845
                                            a 15.9155 15.9155 0 0 1 0 31.831
                                            a 15.9155 15.9155 0 0 1 0 -31.831"
                                          fill="none"
                                          stroke="#e5e7eb"
                                          strokeWidth="2"
                                        />
                                        <path
                                          d="M18 2.0845
                                            a 15.9155 15.9155 0 0 1 0 31.831
                                            a 15.9155 15.9155 0 0 1 0 -31.831"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          strokeDasharray={`${health.mfaSso.score}, 100`}
                                          className={getHealthMeterTextColor(health.mfaSso.status)}
                                        />
                                      </svg>
                                      <div className="absolute inset-0 flex items-center justify-center">
                                        <span className={`text-lg font-bold ${getHealthMeterTextColor(health.mfaSso.status)}`}>
                                          {health.mfaSso.score}%
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <h4 className="font-medium text-sm">MFA/SSO</h4>
                                  <div className={`inline-block px-2 py-1 rounded text-xs font-medium mt-1 ${
                                    health.mfaSso.status === 'good' ? 'bg-green-100 text-green-800' :
                                    health.mfaSso.status === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-red-100 text-red-800'
                                  }`}>
                                    {health.mfaSso.status.toUpperCase()}
                                  </div>
                                </div>

                                {/* EDR Health */}
                                <div className="text-center">
                                  <div className="mb-3">
                                    <div className="relative w-16 h-16 mx-auto">
                                      <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
                                        <path
                                          d="M18 2.0845
                                            a 15.9155 15.9155 0 0 1 0 31.831
                                            a 15.9155 15.9155 0 0 1 0 -31.831"
                                          fill="none"
                                          stroke="#e5e7eb"
                                          strokeWidth="2"
                                        />
                                        <path
                                          d="M18 2.0845
                                            a 15.9155 15.9155 0 0 1 0 31.831
                                            a 15.9155 15.9155 0 0 1 0 -31.831"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          strokeDasharray={`${health.edr.score}, 100`}
                                          className={getHealthMeterTextColor(health.edr.status)}
                                        />
                                      </svg>
                                      <div className="absolute inset-0 flex items-center justify-center">
                                        <span className={`text-lg font-bold ${getHealthMeterTextColor(health.edr.status)}`}>
                                          {health.edr.score}%
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <h4 className="font-medium text-sm">EDR</h4>
                                  <div className={`inline-block px-2 py-1 rounded text-xs font-medium mt-1 ${
                                    health.edr.status === 'good' ? 'bg-green-100 text-green-800' :
                                    health.edr.status === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-red-100 text-red-800'
                                  }`}>
                                    {health.edr.status.toUpperCase()}
                                  </div>
                                </div>

                                {/* SIEM Health */}
                                <div className="text-center">
                                  <div className="mb-3">
                                    <div className="relative w-16 h-16 mx-auto">
                                      <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
                                        <path
                                          d="M18 2.0845
                                            a 15.9155 15.9155 0 0 1 0 31.831
                                            a 15.9155 15.9155 0 0 1 0 -31.831"
                                          fill="none"
                                          stroke="#e5e7eb"
                                          strokeWidth="2"
                                        />
                                        <path
                                          d="M18 2.0845
                                            a 15.9155 15.9155 0 0 1 0 31.831
                                            a 15.9155 15.9155 0 0 1 0 -31.831"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          strokeDasharray={`${health.siem.score}, 100`}
                                          className={getHealthMeterTextColor(health.siem.status)}
                                        />
                                      </svg>
                                      <div className="absolute inset-0 flex items-center justify-center">
                                        <span className={`text-lg font-bold ${getHealthMeterTextColor(health.siem.status)}`}>
                                          {health.siem.score}%
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <h4 className="font-medium text-sm">SIEM/Logging</h4>
                                  <div className={`inline-block px-2 py-1 rounded text-xs font-medium mt-1 ${
                                    health.siem.status === 'good' ? 'bg-green-100 text-green-800' :
                                    health.siem.status === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-red-100 text-red-800'
                                  }`}>
                                    {health.siem.status.toUpperCase()}
                                  </div>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </CardContent>
                    </Card>

                    <div className="grid grid-cols-2 gap-4">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <Shield className="w-5 h-5" />
                            Security Concerns
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-2">
                            {selectedCompany.concerns.map((concern, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm">
                                <AlertCircle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                                {concern}
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-lg">Recent Activity</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-2">
                            {selectedCompany.recentActivity.map((activity, i) => (
                              <li key={i} className="text-sm text-gray-700">• {activity}</li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    </div>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg">Tech Stack & Security Tools</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div>
                            <h4 className="font-medium text-sm mb-2">Technology Stack:</h4>
                            <div className="flex flex-wrap gap-2">
                              {selectedCompany.techStack.map((tech, i) => (
                                <Badge key={i} variant="secondary">{tech}</Badge>
                              ))}
                            </div>
                          </div>
                          <div>
                            <h4 className="font-medium text-sm mb-2">Current Security Tools:</h4>
                            <div className="flex flex-wrap gap-2">
                              {selectedCompany.securityTools.map((tool, i) => (
                                <Badge key={i} variant="outline">{tool}</Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="contacts" className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>Key Contacts</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {(() => {
                          const segmentCounts = getCompanySegmentCounts(selectedCompany);
                          const presentSegments = LAMINAR_SEGMENT_ORDER.filter((id) => segmentCounts.has(id));
                          const totalSegmented = Array.from(segmentCounts.values()).reduce((sum, n) => sum + n, 0);
                          const groups = groupContactsByRole(selectedCompany, contactsTabSegment);
                          const totalInFilter = groups.reduce((sum, g) => sum + g.contacts.length, 0);
                          return (
                            <>
                              {presentSegments.length > 0 && (
                                <div className="flex flex-wrap items-center gap-2 mb-4">
                                  <span className="text-xs font-medium text-gray-500">Segment:</span>
                                  <button
                                    type="button"
                                    onClick={() => setContactsTabSegment('all')}
                                    className={`px-2.5 py-1 text-xs rounded-full border transition ${contactsTabSegment === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                                  >
                                    All ({totalSegmented})
                                  </button>
                                  {presentSegments.map((segId) => (
                                    <button
                                      key={segId}
                                      type="button"
                                      onClick={() => setContactsTabSegment(segId)}
                                      className={`px-2.5 py-1 text-xs rounded-full border transition ${contactsTabSegment === segId ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                                    >
                                      {LAMINAR_SEGMENTS[segId].label} ({segmentCounts.get(segId)})
                                    </button>
                                  ))}
                                </div>
                              )}
                              {totalInFilter === 0 && contactsTabSegment !== 'all' ? (
                                <p className="text-sm text-gray-500 italic">
                                  No contacts in segment "{LAMINAR_SEGMENTS[contactsTabSegment]?.label || contactsTabSegment}" for {selectedCompany.name}.
                                </p>
                              ) : (
                                <div className="space-y-6">
                                  {groups.map((group) => (
                                    group.contacts.length > 0 ? (
                                      <div key={group.key}>
                                        <h4 className="mb-3 text-sm font-semibold text-gray-700">{group.label}</h4>
                                        <div className="space-y-4">
                                          {group.contacts.map((exec, i) => (
                                            <div key={`${group.key}-${i}`} className="flex justify-between items-center p-3 border rounded-lg">
                                              <div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                  <h4 className="font-semibold">{exec.name}</h4>
                                                  <Badge variant="outline">
                                                    {getRoleCategoryLabel(exec.roleCategory)}
                                                  </Badge>
                                                  {getSegmentForContact(exec) && (
                                                    <Badge variant="secondary" className="text-xs">
                                                      {LAMINAR_SEGMENTS[getSegmentForContact(exec)]?.label || getSegmentForContact(exec)}
                                                    </Badge>
                                                  )}
                                                </div>
                                                <p className="text-sm text-gray-600">{exec.title}</p>
                                                <p className="text-sm text-blue-600">{exec.email || 'No verified email'}</p>
                                                <p className="text-xs text-gray-500">
                                                  Relevance {exec.relevanceScore || 0}
                                                  {exec.department ? ` • ${exec.department}` : ''}
                                                  {exec.seniority ? ` • ${exec.seniority}` : ''}
                                                </p>
                                              </div>
                                              <div className="flex gap-2">
                                                <Button size="sm" variant="outline">
                                                  <Mail className="w-4 h-4" />
                                                </Button>
                                                <Button size="sm" variant="outline">
                                                  <Globe className="w-4 h-4" />
                                                </Button>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null
                                  ))}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="intelligence" className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <Card>
                        <CardHeader>
                          <CardTitle>Recent News</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            {selectedCompany.news.map((item, i) => (
                              <div key={i} className="border-l-2 border-blue-200 pl-3">
                                <h4 className="font-medium text-sm">{item.title}</h4>
                                <p className="text-xs text-gray-500">{item.source} • {item.date}</p>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>Company Insights</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div>
                            <h4 className="font-medium text-sm">Social Proof</h4>
                            <p className="text-xs text-gray-600">LinkedIn: {selectedCompany.socialProof.linkedinFollowers.toLocaleString()} followers</p>
                            <p className="text-xs text-gray-600">Glassdoor: {selectedCompany.socialProof.glassdoorRating}/5.0</p>
                          </div>
                          <div>
                            <h4 className="font-medium text-sm">Funding</h4>
                            <p className="text-xs text-gray-600">{selectedCompany.financials.funding}</p>
                            <p className="text-xs text-gray-600">{selectedCompany.financials.lastRound}</p>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>

                  <TabsContent value="signals" className="space-y-4">
                    {renderSignalsTab(selectedCompany)}
                  </TabsContent>

                  <TabsContent value="outreach" className="space-y-4">
                    {((selectedCompany.contacts || []).some((c) => c.segment || c.sourceMeta?.segment) || selectedCompany.segment) && (
                      <LaminarOutreachGenerator
                        company={selectedCompany}
                        laminarAI={netlifyAPI.laminarAI.bind(netlifyAPI)}
                        onSendEmail={(company, variant, persona, tone) => {
                          const exec = getPrimaryContact(company);
                          setEmailData({
                            to: exec?.email || '',
                            subject: variant.subject || `Settlement workflow review for ${company.name}`,
                            body: variant.body || '',
                            persona,
                            tone
                          });
                          setShowEmailModal(true);
                        }}
                      />
                    )}
                    <Card>
                      <CardHeader>
                        <CardTitle>Outreach Engine v2</CardTitle>
                        <p className="text-sm text-gray-600">Generate personalized outreach with AI-powered personas and A/B variants</p>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {getSourceWarning(selectedCompany.sourceMeta) && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                            {getSourceWarning(selectedCompany.sourceMeta)}
                          </div>
                        )}
                        {/* Persona and Tone Selection */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium mb-2">Target Persona</label>
                            <select
                              className="w-full p-2 border rounded-md"
                              value={outreachPersona}
                              onChange={(e) => setOutreachPersona(e.target.value)}
                            >
                              <option value="CFO">CFO (Liquidity & Capital)</option>
                              <option value="Head of Trade Finance">Head of Trade Finance</option>
                              <option value="Settlement Manager">Settlement Manager</option>
                              <option value="Operations Lead">Operations Lead</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-2">Communication Tone</label>
                            <select
                              className="w-full p-2 border rounded-md"
                              value={outreachTone}
                              onChange={(e) => setOutreachTone(e.target.value)}
                            >
                              <option value="formal">Formal (Executive-level)</option>
                              <option value="plain">Plain (Direct & Clear)</option>
                              <option value="urgent">Urgent (Time-sensitive)</option>
                            </select>
                          </div>
                        </div>

                        {/* Generate Variants Button */}
                        <div className="flex justify-center">
                          <Button
                            onClick={() => generateOutreachVariants(selectedCompany)}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <Brain className="w-4 h-4 mr-2" />
                            Generate A/B Variants
                          </Button>
                        </div>

                        {/* A/B Variants Display */}
                        {outreachVariants.length > 0 && (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {outreachVariants.map((variant, index) => (
                              <Card key={index} className={`border-2 ${selectedVariant === index ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                                <CardHeader className="pb-3">
                                  <CardTitle className="text-lg flex items-center justify-between">
                                    <span>Variant {String.fromCharCode(65 + index)}</span>
                                    <Button
                                      size="sm"
                                      variant={selectedVariant === index ? "default" : "outline"}
                                      onClick={() => setSelectedVariant(index)}
                                    >
                                      {selectedVariant === index ? 'Selected' : 'Select'}
                                    </Button>
                                  </CardTitle>
                                  <p className="text-sm text-gray-600">{variant.strategy}</p>
                                </CardHeader>
                                <CardContent>
                                  <div className="space-y-3">
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-1">Subject Line</label>
                                      <div className="p-2 bg-gray-50 rounded text-sm font-medium">
                                        {variant.subject}
                                      </div>
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-1">Email Body</label>
                                      <Textarea
                                        className="w-full h-48 text-sm"
                                        value={variant.body}
                                        readOnly
                                      />
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      <strong>Top Signal:</strong> {variant.topSignal}
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        )}

                        {/* Action Buttons */}
                        {outreachVariants.length > 0 && (
                          <div className="flex gap-2 pt-4 border-t">
                            <Button
                              onClick={() => sendOutreach(selectedCompany, outreachVariants[selectedVariant])}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <Mail className="w-4 h-4 mr-2" />
                              {lastEmailResult?.meta?.source === 'simulated' ? 'Simulate Selected Variant' : 'Send Selected Variant'}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => saveOutreachTemplate(selectedCompany, outreachVariants[selectedVariant])}
                            >
                              <Save className="w-4 h-4 mr-2" />
                              Save Template
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => addToSequence(selectedCompany, outreachVariants[selectedVariant])}
                            >
                              <Calendar className="w-4 h-4 mr-2" />
                              Add to Sequence
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => openCalendarModal(selectedCompany)}
                            >
                              <Clock className="w-4 h-4 mr-2" />
                              Schedule Meeting
                            </Button>
                          </div>
                        )}

                        {/* Outreach Analytics */}
                        {selectedCompany.outreachHistory && selectedCompany.outreachHistory.length > 0 && (
                          <Card className="bg-gray-50">
                            <CardHeader>
                              <CardTitle className="text-lg">Previous Outreach Performance</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="grid grid-cols-3 gap-4">
                                <div className="text-center">
                                  <div className="text-2xl font-bold text-blue-600">
                                    {selectedCompany.outreachHistory.filter(o => o.status === 'sent').length}
                                  </div>
                                  <div className="text-sm text-gray-600">Sent</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-2xl font-bold text-green-600">
                                    {selectedCompany.outreachHistory.filter(o => o.status === 'replied').length}
                                  </div>
                                  <div className="text-sm text-gray-600">Replied</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-2xl font-bold text-purple-600">
                                    {selectedCompany.outreachHistory.filter(o => o.status === 'meeting').length}
                                  </div>
                                  <div className="text-sm text-gray-600">Meetings</div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="activity">
                    <div className="space-y-6">
                      {/* Active Sequence */}
                      {(() => {
                        const activeSequence = getActiveSequenceForCompany(selectedCompany.id);
                        return activeSequence ? (
                          <Card className="border-blue-200 bg-blue-50">
                            <CardHeader>
                              <CardTitle className="flex items-center justify-between">
                                <span className="flex items-center gap-2">
                                  <Calendar className="w-5 h-5 text-blue-600" />
                                  Active 3-Touch Sequence
                                </span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => cancelSequence(activeSequence.id)}
                                  className="text-red-600 border-red-300 hover:bg-red-50"
                                >
                                  Cancel Sequence
                                </Button>
                              </CardTitle>
                              <p className="text-sm text-blue-700">
                                Started {new Date(activeSequence.createdAt).toLocaleDateString()} •
                                Persona: {activeSequence.persona} •
                                Tone: {activeSequence.tone}
                              </p>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-4">
                                {activeSequence.touches.map((touch, index) => (
                                  <div key={touch.id} className="flex items-center gap-4 p-3 bg-white rounded-lg border">
                                    <div className="flex-shrink-0">
                                      {touch.completed ? (
                                        <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                                          <CheckCircle2 className="w-4 h-4 text-white" />
                                        </div>
                                      ) : (
                                        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm font-medium">
                                          {touch.id}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex-1">
                                      <div className="flex items-center justify-between">
                                        <h4 className="font-medium">{touch.title}</h4>
                                        <div className="flex items-center gap-2">
                                          {touch.type === 'email' ? (
                                            <Mail className="w-4 h-4 text-gray-500" />
                                          ) : (
                                            <Globe className="w-4 h-4 text-blue-500" />
                                          )}
                                          <span className="text-sm text-gray-600">
                                            Due: {new Date(touch.dueDate).toLocaleDateString()}
                                          </span>
                                        </div>
                                      </div>
                                      <p className="text-sm text-gray-600 mt-1">
                                        {formatSignalType(touch.signal.type)}: {touch.signal.details}
                                      </p>
                                      {touch.completed ? (
                                        <p className="text-xs text-green-600 mt-1">
                                          ✓ Completed {new Date(touch.completedAt).toLocaleDateString()}
                                        </p>
                                      ) : (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="mt-2"
                                          onClick={() => markTouchComplete(activeSequence.id, touch.id)}
                                        >
                                          Mark Complete
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        ) : null;
                      })()}

                      {/* Engagement Timeline */}
                      <Card>
                        <CardHeader>
                          <CardTitle>Engagement Timeline</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {renderActivityTimeline(selectedCompany)}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>

                  <TabsContent value="instructions">
                    <div className="space-y-6">
                      {/* Getting Started */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Target className="w-5 h-5 text-blue-600" />
                            INP² Cybersecurity Lead Generator - User Guide
                          </CardTitle>
                          <p className="text-sm text-gray-600">
                            Your complete guide to generating high-quality cybersecurity leads and booking meetings faster
                          </p>
                        </CardHeader>
                        <CardContent className="space-y-6">
                          {/* Overview Section */}
                          <div>
                            <h3 className="text-lg font-semibold mb-3 text-gray-800">🎯 What This Tool Does</h3>
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                              <p className="text-sm text-blue-800 mb-2">
                                <strong>The fastest path from intent signal → meeting for cybersecurity services.</strong>
                              </p>
                              <ul className="text-sm text-blue-700 space-y-1 ml-4">
                                <li>• Collect and enrich company leads with security-relevant signals</li>
                                <li>• Prioritize prospects transparently with AI-powered scoring</li>
                                <li>• Generate contextual outreach targeted to executive buyers (CFO, Treasury, Trade Finance, Operations)</li>
                                <li>• Track engagement and automate follow-up sequences</li>
                              </ul>
                            </div>
                          </div>

                          {/* Success Metrics */}
                          <div>
                            <h3 className="text-lg font-semibold mb-3 text-gray-800">📊 Target Success Metrics</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                                <div className="text-2xl font-bold text-green-600">≥10%</div>
                                <div className="text-xs text-green-700">Reply Rate</div>
                              </div>
                              <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                                <div className="text-2xl font-bold text-blue-600">≥5%</div>
                                <div className="text-xs text-blue-700">Meeting Rate</div>
                              </div>
                              <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
                                <div className="text-2xl font-bold text-purple-600">≤10min</div>
                                <div className="text-xs text-purple-700">First Qualified List</div>
                              </div>
                              <div className="bg-orange-50 p-3 rounded-lg border border-orange-200">
                                <div className="text-2xl font-bold text-orange-600">60%</div>
                                <div className="text-xs text-orange-700">Time Saved</div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Tab-by-Tab Guide */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <List className="w-5 h-5 text-green-600" />
                            Complete Tab-by-Tab Guide
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-8">

                          {/* Overview Tab */}
                          <div className="border-l-4 border-blue-500 pl-4">
                            <h4 className="text-lg font-semibold text-blue-700 mb-2">1. Overview Tab</h4>
                            <p className="text-sm text-gray-600 mb-3">
                              <strong>Purpose:</strong> Get a complete 360° view of your selected company with AI-powered insights and decision cards.
                            </p>
                            <div className="space-y-2 text-sm">
                              <div><strong>Decision Cards:</strong> See "Why Now?", "What We'd Do First", and "Risks of Waiting" - use these talking points in conversations</div>
                              <div><strong>Company Info:</strong> Basic details, employee count, revenue, industry classification</div>
                              <div><strong>Security Score:</strong> AI-calculated priority score (1-100) with explanation of factors</div>
                              <div><strong>Tech Stack:</strong> Current technology infrastructure and security tools in use</div>
                              <div><strong>Security Concerns:</strong> Identified vulnerabilities and compliance gaps</div>
                              <div><strong>Recent Activity:</strong> Latest news, funding, executive changes, and business events</div>
                            </div>
                            <div className="bg-yellow-50 p-3 rounded mt-3 border border-yellow-200">
                              <p className="text-xs text-yellow-800"><strong>💡 Pro Tip:</strong> Use the decision cards as conversation starters - they're designed for executive-level discussions.</p>
                            </div>
                          </div>

                          {/* Contacts Tab */}
                          <div className="border-l-4 border-green-500 pl-4">
                            <h4 className="text-lg font-semibold text-green-700 mb-2">2. Contacts Tab</h4>
                            <p className="text-sm text-gray-600 mb-3">
                              <strong>Purpose:</strong> Access verified executive contacts with direct email addresses and phone numbers.
                            </p>
                            <div className="space-y-2 text-sm">
                              <div><strong>Executive Contacts:</strong> CFO, Treasurer, Head of Trade Finance, Settlement Manager with verified business emails</div>
                              <div><strong>Contact Information:</strong> Direct phone numbers, LinkedIn profiles, email addresses</div>
                              <div><strong>Role Context:</strong> Each contact shows their specific cybersecurity responsibilities</div>
                              <div><strong>Best Contact Time:</strong> Suggested optimal outreach timing based on role and company size</div>
                            </div>
                            <div className="bg-green-50 p-3 rounded mt-3 border border-green-200">
                              <p className="text-xs text-green-800"><strong>✅ Best Practice:</strong> Start with Head of Trade Finance for workflow friction, Settlement Manager for daily execution, and CFO for capital impact.</p>
                            </div>
                          </div>

                          {/* Intelligence Tab */}
                          <div className="border-l-4 border-purple-500 pl-4">
                            <h4 className="text-lg font-semibold text-purple-700 mb-2">3. Intelligence Tab</h4>
                            <p className="text-sm text-gray-600 mb-3">
                              <strong>Purpose:</strong> Deep dive into recent news, funding events, and business intelligence that creates urgency.
                            </p>
                            <div className="space-y-2 text-sm">
                              <div><strong>Recent News:</strong> Company announcements, press releases, industry coverage</div>
                              <div><strong>Funding Events:</strong> Recent investments, acquisitions, IPO preparations</div>
                              <div><strong>Regulatory Changes:</strong> Upcoming compliance deadlines and requirements</div>
                              <div><strong>Competitive Intelligence:</strong> Market position and competitive pressures</div>
                              <div><strong>Growth Indicators:</strong> Hiring patterns, office expansions, new market entries</div>
                            </div>
                            <div className="bg-purple-50 p-3 rounded mt-3 border border-purple-200">
                              <p className="text-xs text-purple-800"><strong>🔍 Usage Tip:</strong> Reference specific news items in your outreach to show you're informed about their business.</p>
                            </div>
                          </div>

                          {/* Signals Tab */}
                          <div className="border-l-4 border-orange-500 pl-4">
                            <h4 className="text-lg font-semibold text-orange-700 mb-2">4. Signals Tab</h4>
                            <p className="text-sm text-gray-600 mb-3">
                              <strong>Purpose:</strong> View AI-detected intent signals that indicate when a company is ready to buy cybersecurity services.
                            </p>
                            <div className="space-y-2 text-sm">
                              <div><strong>Breach Proximity:</strong> Recent security incidents affecting their vendors or industry</div>
                              <div><strong>Regulatory Countdown:</strong> Upcoming compliance deadlines (SOC 2, GDPR, etc.)</div>
                              <div><strong>Executive Changes:</strong> New finance, treasury, or settlement leaders indicating process and control changes</div>
                              <div><strong>Insurance Renewal:</strong> Cyber insurance renewal windows requiring security improvements</div>
                              <div><strong>Attack Surface:</strong> Detected security configuration regressions</div>
                              <div><strong>AI Governance Gaps:</strong> Companies using AI without proper security governance</div>
                            </div>
                            <div className="bg-orange-50 p-3 rounded mt-3 border border-orange-200">
                              <p className="text-xs text-orange-800"><strong>⚡ Power Move:</strong> Lead with the highest-scoring signal in your outreach - it's your "why now" moment.</p>
                            </div>
                          </div>

                          {/* Outreach Tab */}
                          <div className="border-l-4 border-red-500 pl-4">
                            <h4 className="text-lg font-semibold text-red-700 mb-2">5. Outreach Tab - Email Generation & Templates</h4>
                            <p className="text-sm text-gray-600 mb-3">
                              <strong>Purpose:</strong> Generate personalized, contextual emails that get responses using AI-powered personas and signals.
                            </p>

                            <div className="space-y-4">
                              <div>
                                <h5 className="font-semibold text-gray-700 mb-2">🎭 Persona Selection</h5>
                                <div className="space-y-1 text-sm">
                                  <div><strong>Head of Trade Finance:</strong> Process friction focus, mentions document flow and timing reliability</div>
                                  <div><strong>Settlement Manager:</strong> Reconciliation, exceptions, and workflow emphasis</div>
                                  <div><strong>CFO:</strong> Liquidity impact, capital efficiency, and control-cost messaging</div>
                                </div>
                              </div>

                              <div>
                                <h5 className="font-semibold text-gray-700 mb-2">📝 Communication Tones</h5>
                                <div className="space-y-1 text-sm">
                                  <div><strong>Formal:</strong> Executive-level language, professional tone</div>
                                  <div><strong>Plain:</strong> Direct and clear, no jargon</div>
                                  <div><strong>Urgent:</strong> Time-sensitive messaging for high-priority signals</div>
                                </div>
                              </div>

                              <div>
                                <h5 className="font-semibold text-gray-700 mb-2">📧 Email Templates & Usage</h5>
                                <div className="bg-gray-50 p-4 rounded-lg border space-y-3">
                                  <div>
                                    <strong className="text-sm">Template Tokens (Auto-filled):</strong>
                                    <div className="text-xs text-gray-600 ml-4 mt-1 space-y-1">
                                      <div>• <code>{'{company}'}</code> - Company name</div>
                                      <div>• <code>{'{exec_title}'}</code> - Recipient's job title</div>
                                      <div>• <code>{'{recent_news.title}'}</code> - Latest company news</div>
                                      <div>• <code>{'{top_signal}'}</code> - Highest-scoring intent signal</div>
                                      <div>• <code>{'{tech.0}'}</code> - Primary technology stack item</div>
                                      <div>• <code>{'{next_week_slots}'}</code> - Available meeting times</div>
                                    </div>
                                  </div>
                                  <div>
                                    <strong className="text-sm">A/B Testing:</strong>
                                    <div className="text-xs text-gray-600 ml-4 mt-1">
                                      Generate 2 variants with different subject lines and save your chosen version for tracking performance.
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div>
                                <h5 className="font-semibold text-gray-700 mb-2">📬 Send Email & Schedule Meeting</h5>
                                <div className="space-y-2 text-sm">
                                  <div><strong>Send Email:</strong> Integrates with your email provider to send directly from the platform</div>
                                  <div><strong>Schedule Meeting:</strong> Automatically includes calendar booking links in emails</div>
                                  <div><strong>Meeting Types:</strong> 15-min discovery calls, 30-min demos, or 60-min assessments</div>
                                  <div><strong>Follow-up Automation:</strong> Sets reminders and sequences based on recipient response</div>
                                </div>
                              </div>
                            </div>

                            <div className="bg-red-50 p-3 rounded mt-3 border border-red-200">
                              <p className="text-xs text-red-800"><strong>🎯 Success Formula:</strong> Right Persona + Right Signal + Right Tone = Higher Reply Rates</p>
                            </div>
                          </div>

                          {/* Activity Tab */}
                          <div className="border-l-4 border-indigo-500 pl-4">
                            <h4 className="text-lg font-semibold text-indigo-700 mb-2">6. Activity Tab - Sequences & Tracking</h4>
                            <p className="text-sm text-gray-600 mb-3">
                              <strong>Purpose:</strong> Track engagement history and manage automated follow-up sequences.
                            </p>
                            <div className="space-y-2 text-sm">
                              <div><strong>3-Touch Sequences:</strong> Email → LinkedIn → Follow-up email over 10 days</div>
                              <div><strong>Engagement Timeline:</strong> Complete history of all interactions with the company</div>
                              <div><strong>Response Tracking:</strong> Monitor opens, clicks, replies, and meeting bookings</div>
                              <div><strong>Sequence Management:</strong> Mark touches complete, cancel sequences, adjust timing</div>
                              <div><strong>Performance Analytics:</strong> Track conversion rates by persona, tone, and signal type</div>
                            </div>
                            <div className="bg-indigo-50 p-3 rounded mt-3 border border-indigo-200">
                              <p className="text-xs text-indigo-800"><strong>📈 Optimization:</strong> Each touch references a different top signal to maintain relevance throughout the sequence.</p>
                            </div>
                          </div>

                        </CardContent>
                      </Card>

                      {/* Workflow Guide */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Clock className="w-5 h-5 text-purple-600" />
                            Recommended Workflow
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">1</div>
                              <div>
                                <h4 className="font-semibold">Generate & Filter Leads</h4>
                                <p className="text-sm text-gray-600">Use "Generate Leads" panel to fetch companies. Filter by industry, size, and priority score.</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center text-sm font-bold">2</div>
                              <div>
                                <h4 className="font-semibold">Analyze High-Priority Prospects</h4>
                                <p className="text-sm text-gray-600">Click on Critical/High priority leads. Review Overview → Signals → Intelligence tabs.</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 bg-purple-500 text-white rounded-full flex items-center justify-center text-sm font-bold">3</div>
                              <div>
                                <h4 className="font-semibold">Identify Key Contacts</h4>
                                <p className="text-sm text-gray-600">Check Contacts tab for the right executive. Match persona to their role and responsibilities.</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center text-sm font-bold">4</div>
                              <div>
                                <h4 className="font-semibold">Craft Personalized Outreach</h4>
                                <p className="text-sm text-gray-600">Use Outreach tab to generate personalized emails. Choose appropriate persona and tone.</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center text-sm font-bold">5</div>
                              <div>
                                <h4 className="font-semibold">Send & Schedule</h4>
                                <p className="text-sm text-gray-600">Send email directly from platform and include calendar booking link for immediate meeting scheduling.</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 bg-indigo-500 text-white rounded-full flex items-center justify-center text-sm font-bold">6</div>
                              <div>
                                <h4 className="font-semibold">Track & Follow Up</h4>
                                <p className="text-sm text-gray-600">Monitor Activity tab for responses. Use automated sequences for systematic follow-up.</p>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Best Practices */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Crown className="w-5 h-5 text-yellow-600" />
                            Best Practices & Pro Tips
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid md:grid-cols-2 gap-6">
                            <div>
                              <h4 className="font-semibold text-green-700 mb-2">✅ Do's</h4>
                              <ul className="text-sm space-y-1 text-gray-700">
                                <li>• Start with Critical/High priority leads</li>
                                <li>• Reference specific signals in your outreach</li>
                                <li>• Use decision cards as conversation starters</li>
                                <li>• Test different personas for the same company</li>
                                <li>• Follow up within 48 hours of initial contact</li>
                                <li>• Include clear meeting booking links</li>
                                <li>• Track A/B performance to improve messaging</li>
                              </ul>
                            </div>
                            <div>
                              <h4 className="font-semibold text-red-700 mb-2">❌ Don'ts</h4>
                              <ul className="text-sm space-y-1 text-gray-700">
                                <li>• Don't ignore Low priority leads completely</li>
                                <li>• Don't use generic, non-personalized emails</li>
                                <li>• Don't overload emails with multiple signals</li>
                                <li>• Don't skip the Intelligence tab research</li>
                                <li>• Don't send sequences without monitoring responses</li>
                                <li>• Don't forget to update lead status after contact</li>
                                <li>• Don't use urgent tone unless signal supports it</li>
                              </ul>
                            </div>
                          </div>

                          <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 mt-4">
                            <h5 className="font-semibold text-yellow-800 mb-2">🏆 Advanced Strategies</h5>
                            <ul className="text-sm text-yellow-700 space-y-1">
                              <li>• <strong>Signal Stacking:</strong> When a company has multiple high-scoring signals, mention 2-3 in your email</li>
                              <li>• <strong>Persona Rotation:</strong> If the CFO doesn’t respond, try Head of Trade Finance or Settlement Manager with a workflow angle</li>
                              <li>• <strong>News Tie-ins:</strong> Always connect cybersecurity needs to their recent business news</li>
                              <li>• <strong>Compliance Urgency:</strong> Use regulatory countdown signals for CFO outreach</li>
                              <li>• <strong>Operational Proof:</strong> Reference RFP, workforce stress, and settlement-timing signals when targeting operators</li>
                            </ul>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Contact Memo Templates */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Eye className="w-5 h-5 text-blue-600" />
                            Contact Memo Templates
                          </CardTitle>
                          <p className="text-sm text-gray-600">Use these templates to document your interactions and next steps</p>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-4">
                            <div className="border rounded-lg p-4 bg-gray-50">
                              <h5 className="font-semibold mb-2">Initial Contact Memo</h5>
                              <div className="bg-white p-3 rounded border text-sm font-mono">
                                <div className="space-y-1">
                                  <div><strong>Company:</strong> {'{company_name}'}</div>
                                  <div><strong>Contact:</strong> {'{exec_name}'} - {'{exec_title}'}</div>
                                  <div><strong>Contact Method:</strong> Email / Phone / LinkedIn</div>
                                  <div><strong>Primary Signal:</strong> {'{top_signal_type}'} - {'{signal_details}'}</div>
                                  <div><strong>Persona Used:</strong> {'{persona}'} / {'{tone}'}</div>
                                  <div><strong>Key Message:</strong> [Brief summary of main talking points]</div>
                                  <div><strong>Next Steps:</strong> [Expected response timeline and follow-up plan]</div>
                                  <div><strong>Meeting Link Sent:</strong> Yes/No</div>
                                  <div><strong>Notes:</strong> [Additional context or observations]</div>
                                </div>
                              </div>
                            </div>

                            <div className="border rounded-lg p-4 bg-gray-50">
                              <h5 className="font-semibold mb-2">Follow-up Memo</h5>
                              <div className="bg-white p-3 rounded border text-sm font-mono">
                                <div className="space-y-1">
                                  <div><strong>Follow-up #:</strong> [1, 2, 3]</div>
                                  <div><strong>Days Since Last Contact:</strong> [X days]</div>
                                  <div><strong>Response Received:</strong> Yes/No</div>
                                  <div><strong>Response Type:</strong> Interested / Not Now / Objection / Meeting Booked</div>
                                  <div><strong>New Signal Used:</strong> {'{secondary_signal}'}</div>
                                  <div><strong>Adjusted Approach:</strong> [Any changes in messaging or persona]</div>
                                  <div><strong>Objection/Concern:</strong> [If any raised]</div>
                                  <div><strong>Next Action:</strong> [Specific next step and timeline]</div>
                                  <div><strong>Sequence Status:</strong> Continue / Pause / End</div>
                                </div>
                              </div>
                            </div>

                            <div className="border rounded-lg p-4 bg-gray-50">
                              <h5 className="font-semibold mb-2">Meeting Booked Memo</h5>
                              <div className="bg-white p-3 rounded border text-sm font-mono">
                                <div className="space-y-1">
                                  <div><strong>Meeting Type:</strong> Discovery / Demo / Assessment</div>
                                  <div><strong>Date & Time:</strong> [Scheduled date/time]</div>
                                  <div><strong>Duration:</strong> 15min / 30min / 60min</div>
                                  <div><strong>Attendees:</strong> [Who will be joining]</div>
                                  <div><strong>Meeting Focus:</strong> [Primary topics to cover]</div>
                                  <div><strong>Prep Needed:</strong> [Research/materials to prepare]</div>
                                  <div><strong>Success Criteria:</strong> [What defines a successful meeting]</div>
                                  <div><strong>Follow-up Plan:</strong> [Post-meeting next steps]</div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="bg-blue-50 p-3 rounded border border-blue-200">
                            <p className="text-xs text-blue-800">
                              <strong>💡 Tip:</strong> Copy these templates into your CRM or note-taking system. Update after each interaction to maintain detailed prospect intelligence.
                            </p>
                          </div>
                        </CardContent>
                      </Card>

                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>
        </div>
        )
      )}

      {/* Save Segment Modal */}
      {showSaveSegmentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Save Segment</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSaveSegmentModal(false)}
                >
                  ×
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Segment Name</label>
                <Input
                  placeholder="e.g., US Healthcare High Priority"
                  value={segmentName}
                  onChange={(e) => setSegmentName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && saveCurrentSegment()}
                />
              </div>

              <div className="text-sm text-gray-600">
                <h4 className="font-medium mb-2">Current Filters:</h4>
                <ul className="space-y-1">
                  {searchTerm && <li>• Search: "{searchTerm}"</li>}
                  {filterIndustry !== 'all' && <li>• Industry: {filterIndustry}</li>}
                  {filterState !== 'all' && <li>• State: {filterState}</li>}
                  {signalFilter !== 'all' && <li>• Signal: {signalFilter}</li>}
                  {severityFilter !== 'all' && <li>• Severity: {severityFilter}</li>}
                </ul>
                <p className="mt-2">
                  Will save {getFilteredCompanies().length} companies with average score of{' '}
                  {getFilteredCompanies().length > 0
                    ? Math.round(getFilteredCompanies().reduce((sum, c) => sum + c.leadScore, 0) / getFilteredCompanies().length)
                    : 0}
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={saveCurrentSegment}
                  disabled={!segmentName.trim()}
                  className="flex-1"
                >
                  Save Segment
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowSaveSegmentModal(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Email Composition Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl mx-4 max-h-[90vh] overflow-auto">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Compose Email</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowEmailModal(false)}
                >
                  ✕
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {lastEmailResult?.meta && (
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <div>
                    Last outreach action
                    <span className="ml-2 text-xs text-gray-500">{lastEmailResult.provider}</span>
                  </div>
                  <Badge variant="outline" className={getSourceBadge(lastEmailResult.meta).className}>
                    {getSourceBadge(lastEmailResult.meta).label}
                  </Badge>
                </div>
              )}
              {/* Persona and Tone Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Target Persona</label>
                  <select
                    className="w-full px-3 py-2 border rounded-md"
                    value={emailData.persona}
                    onChange={(e) => {
                      const newPersona = e.target.value;
                      setEmailData(prev => ({
                        ...prev,
                        persona: newPersona,
                        body: generatePersonalizedEmail(selectedCompany, newPersona, prev.tone)
                      }));
                    }}
                  >
                    <option value="CFO">CFO (Liquidity & Capital)</option>
                    <option value="Head of Trade Finance">Head of Trade Finance</option>
                    <option value="Settlement Manager">Settlement Manager</option>
                    <option value="Operations Lead">Operations Lead</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Tone</label>
                  <select
                    className="w-full px-3 py-2 border rounded-md"
                    value={emailData.tone}
                    onChange={(e) => {
                      const newTone = e.target.value;
                      setEmailData(prev => ({
                        ...prev,
                        tone: newTone,
                        body: generatePersonalizedEmail(selectedCompany, prev.persona, newTone)
                      }));
                    }}
                  >
                    <option value="professional">Professional</option>
                    <option value="casual">Casual</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              {/* Email Fields */}
              <div>
                <label className="block text-sm font-medium mb-1">To</label>
                <Input
                  type="email"
                  value={emailData.to}
                  onChange={(e) => setEmailData(prev => ({ ...prev, to: e.target.value }))}
                  placeholder="recipient@company.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Subject</label>
                <Input
                  value={emailData.subject}
                  onChange={(e) => setEmailData(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder="Email subject"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Message</label>
                <Textarea
                  value={emailData.body}
                  onChange={(e) => setEmailData(prev => ({ ...prev, body: e.target.value }))}
                  rows={12}
                  className="resize-none"
                  placeholder="Email content"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowEmailModal(false)}
                  disabled={emailSending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={sendEmail}
                  disabled={emailSending || !emailData.to || !emailData.subject}
                >
                  {emailSending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      {lastEmailResult?.meta?.source === 'simulated' ? 'Simulate Send' : 'Send Email'}
                    </>
                  )}
                </Button>
              </div>

              {/* Email Preview Info */}
              <div className="text-xs text-gray-500 border-t pt-2">
                <p><strong>Company:</strong> {selectedCompany?.name}</p>
                <p><strong>Industry:</strong> {selectedCompany?.industry}</p>
                <p><strong>Size:</strong> {selectedCompany?.employees} employees</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Calendar Scheduler Modal */}
      {showCalendarModal && selectedCompany && (
        <CalendarScheduler
          lead={selectedCompany}
          onScheduled={handleMeetingScheduled}
          onClose={() => setShowCalendarModal(false)}
          netlifyAPI={netlifyAPI}
        />
      )}

      {/* Bulk Email Modal */}
      {showBulkEmailModal && (
        <BulkEmail
          companies={filteredCompanies}
          onClose={() => setShowBulkEmailModal(false)}
          netlifyAPI={netlifyAPI}
        />
      )}

      {/* Analytics Modal */}
      {showAnalyticsModal && (
        <Analytics
          companies={filteredCompanies}
          onClose={() => setShowAnalyticsModal(false)}
        />
      )}

      {/* Sequence Modal */}
      {showSequenceModal && selectedSequenceCompany && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg mx-4">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Create 3-Touch Sequence</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSequenceModal(false)}
                >
                  ×
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="font-medium text-blue-900 mb-2">Sequence Overview</h4>
                <div className="space-y-2 text-sm text-blue-800">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span><strong>Touch 1:</strong> Initial Email (Today)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    <span><strong>Touch 2:</strong> LinkedIn Note (+4 days)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    <span><strong>Touch 3:</strong> Follow-up Email (+10 days)</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium mb-2">Company: {selectedSequenceCompany.name}</h4>
                <p className="text-sm text-gray-600">
                  Each touch will reference different signals based on your selected persona and tone.
                  The sequence will automatically space communications over 10 days.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => createSequence(selectedSequenceCompany, outreachVariants[selectedVariant])}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  disabled={!outreachVariants.length}
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Create Sequence
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowSequenceModal(false)}
                >
                  Cancel
                </Button>
              </div>

              {!outreachVariants.length && (
                <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded">
                  Please generate outreach variants first in the Outreach tab.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

// Memoized Lead Card Component for better performance
const MemoizedLeadCard = memo(({ company, index, onSelect, getScoreColor, getPriorityColor }) => {
  return (
    <Card
      key={company.id}
      className="cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.02] border-l-4"
      style={{ borderLeftColor: company.priority === 'Critical' ? '#ef4444' : company.priority === 'High' ? '#f97316' : '#eab308' }}
      onClick={() => onSelect(company)}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <Badge className={getPriorityColor(company.priority)}>
            {company.priority}
          </Badge>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${getScoreColor(company.leadScore)}`}></div>
            <span className="font-bold text-lg">{company.leadScore}</span>
          </div>
        </div>
        <h3 className="font-semibold text-lg mb-1 truncate">{company.name}</h3>
        <p className="text-sm text-gray-600 mb-2">{company.industry} • {company.employees} employees</p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">{company.location}</span>
          <Badge variant="outline" className="text-xs">
            {company.status}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
});

MemoizedLeadCard.displayName = 'MemoizedLeadCard';

// Loading Skeleton Components
const LeadCardSkeleton = () => (
  <Card className="border-l-4 border-l-gray-300">
    <CardContent className="p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="w-16 h-5 bg-gray-200 rounded animate-pulse"></div>
        <div className="w-8 h-8 bg-gray-200 rounded animate-pulse"></div>
      </div>
      <div className="w-3/4 h-6 bg-gray-200 rounded mb-1 animate-pulse"></div>
      <div className="w-1/2 h-4 bg-gray-200 rounded mb-2 animate-pulse"></div>
      <div className="flex items-center justify-between">
        <div className="w-1/3 h-4 bg-gray-200 rounded animate-pulse"></div>
        <div className="w-16 h-5 bg-gray-200 rounded animate-pulse"></div>
      </div>
    </CardContent>
  </Card>
);

const TabContentSkeleton = () => (
  <div className="space-y-4">
    <div className="w-full h-6 bg-gray-200 rounded animate-pulse"></div>
    <div className="space-y-2">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="w-full h-4 bg-gray-200 rounded animate-pulse"></div>
      ))}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Laminar Pilot Board (v2) — metrics bar, Why-Now cards, heat-scored contacts
// ─────────────────────────────────────────────────────────────────────────────

const SEGMENT_COLOR_BG = {
  energy_traders: 'bg-amber-50 border-amber-200',
  banks: 'bg-blue-50 border-blue-200',
  midstream: 'bg-emerald-50 border-emerald-200',
  inspection: 'bg-purple-50 border-purple-200'
};

const SEGMENT_COLOR_ACCENT = {
  energy_traders: 'text-amber-700',
  banks: 'text-blue-700',
  midstream: 'text-emerald-700',
  inspection: 'text-purple-700'
};

const LaminarMetricsBar = ({ companies, onJumpToSegment }) => {
  const metricsBySegment = useMemo(() => {
    const m = {};
    for (const segId of LAMINAR_SEGMENT_ORDER) {
      m[segId] = computeSegmentMetrics(companies, segId);
    }
    return m;
  }, [companies]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      {LAMINAR_SEGMENT_ORDER.map((segId) => {
        const segment = LAMINAR_SEGMENTS[segId];
        const metrics = metricsBySegment[segId];
        const scoreColor = metrics.avgScore >= 75 ? 'text-green-700' : metrics.avgScore >= 50 ? 'text-amber-700' : 'text-gray-500';
        return (
          <button
            key={segId}
            type="button"
            onClick={() => onJumpToSegment(segId)}
            className={`p-3 rounded-lg border text-left hover:shadow-md transition ${SEGMENT_COLOR_BG[segId]}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-base">{SEGMENT_ICONS[segId]}</span>
                <span className={`text-xs font-semibold ${SEGMENT_COLOR_ACCENT[segId]}`}>{segment.label}</span>
              </div>
              <span className={`text-lg font-bold ${scoreColor}`}>{metrics.avgScore}</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-gray-600">
              <span>{metrics.companies} cos</span>
              <span>{metrics.contacts} contacts</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px]">
              {metrics.hotCount > 0 && (
                <span className="inline-flex items-center gap-0.5 text-red-600 font-medium">
                  <Flame className="w-3 h-3" />{metrics.hotCount}
                </span>
              )}
              {metrics.warmCount > 0 && (
                <span className="text-amber-600 font-medium">● {metrics.warmCount}</span>
              )}
              {metrics.hotCount === 0 && metrics.warmCount === 0 && (
                <span className="text-gray-400">no heat yet</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};

const LaminarWhyNowCard = ({ topSignal, segmentId, onView }) => {
  if (!topSignal) {
    return (
      <div className="text-[11px] text-gray-500 italic px-2 py-1.5 bg-white border border-gray-200 rounded mb-2">
        No fresh signals — refresh to scan for breach proximity, exec moves, and active RFPs.
      </div>
    );
  }

  const heatIcon = topSignal.scoreImpact >= 30 ? <Flame className="w-3.5 h-3.5 text-red-500" /> : <span className="text-amber-500">●</span>;

  return (
    <button
      type="button"
      onClick={() => onView(topSignal.companyId)}
      className="w-full text-left px-2 py-2 bg-white border border-gray-200 rounded mb-2 hover:border-blue-400 hover:shadow-sm transition"
      title={topSignal.details}
    >
      <div className="flex items-start gap-1.5">
        <div className="mt-0.5">{heatIcon}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold text-gray-700 mb-0.5">Why now</div>
          <div className="text-xs text-gray-800 line-clamp-2">{topSignal.details}</div>
          <div className="text-[10px] text-gray-500 mt-0.5">{topSignal.companyName} · {topSignal.daysAgo}d ago</div>
        </div>
      </div>
    </button>
  );
};

const LaminarContactCard = ({ contact, company, heat, onViewCompany, onDraftEmail, onSchedule, onAddToSequence, getRoleCategoryLabel }) => {
  const heatBadge = heat >= 75
    ? <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded"><Flame className="w-3 h-3" />{heat}</span>
    : heat >= 50
      ? <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">● {heat}</span>
      : null;

  const wc = getCompanyWorkingCapital(company);
  const topSignal = useMemo(() => {
    const signals = Array.isArray(company?.signals) ? company.signals : [];
    if (!signals.length) return null;
    const sorted = [...signals].sort((a, b) => (b.scoreImpact || 0) - (a.scoreImpact || 0));
    const sig = sorted[0];
    const occurredAt = sig?.occurredAt ? new Date(sig.occurredAt) : null;
    const daysAgo = occurredAt && !Number.isNaN(occurredAt.getTime())
      ? Math.max(0, Math.round((Date.now() - occurredAt.getTime()) / (24 * 60 * 60 * 1000)))
      : null;
    return { details: sig.details || sig.description || 'Signal detected', daysAgo };
  }, [company]);

  return (
    <div className="p-2.5 bg-white border border-gray-200 rounded hover:border-blue-400 hover:shadow-sm transition">
      <button type="button" onClick={onViewCompany} className="w-full text-left">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate">{contact.name || 'Unknown'}</div>
            <div className="text-xs text-gray-600 truncate">{contact.title}</div>
            <div className="text-[11px] text-gray-500 truncate">{company?.name}</div>
          </div>
          {heatBadge}
        </div>
        {wc && (
          <div className="text-[11px] text-amber-700 font-semibold mb-1">
            <DollarSign className="inline w-3 h-3 mr-0.5" />{formatCurrencyShort(wc.locked)} working capital locked
          </div>
        )}
        {topSignal && (
          <div className="text-[11px] text-gray-700 italic mb-1 line-clamp-1" title={topSignal.details}>
            ⚡ {topSignal.details}{topSignal.daysAgo !== null ? ` · ${topSignal.daysAgo}d ago` : ''}
          </div>
        )}
        {contact.roleCategory && (
          <div className="text-[10px] text-gray-500">{getRoleCategoryLabel(contact.roleCategory)}</div>
        )}
      </button>
      <div className="flex gap-1 mt-2 pt-2 border-t border-gray-100">
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={(e) => { e.stopPropagation(); onDraftEmail(company); }} title="Draft email">
          <Mail className="w-3 h-3" />
        </Button>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={(e) => { e.stopPropagation(); onSchedule(company); }} title="Schedule call">
          <Calendar className="w-3 h-3" />
        </Button>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={(e) => { e.stopPropagation(); onAddToSequence(company); }} title="Add to sequence">
          <Plus className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
};

const LaminarSegmentColumn = ({
  segmentId,
  companies,
  sortMode,
  onSortChange,
  refreshing,
  onRefresh,
  onViewCompany,
  onDraftEmail,
  onSchedule,
  onAddToSequence,
  getRoleCategoryLabel
}) => {
  const segment = LAMINAR_SEGMENTS[segmentId];

  const companiesById = useMemo(() => {
    const m = {};
    for (const c of companies) m[c.id] = c;
    return m;
  }, [companies]);

  const segmentContacts = useMemo(() => {
    const list = [];
    for (const company of companies) {
      const contacts = Array.isArray(company.contacts) ? company.contacts : [];
      for (const contact of contacts) {
        if ((contact.segment || contact.sourceMeta?.segment || '') === segmentId
          || (contact.segment === undefined && contact.sourceMeta?.segment === undefined)) {
          // Fall back to inference for legacy contacts
        }
      }
    }
    // Use the helper from the inner module
    const flat = [];
    for (const company of companies) {
      const contacts = Array.isArray(company.contacts) ? company.contacts : [];
      for (const contact of contacts) {
        const seg = contact.segment ?? contact.sourceMeta?.segment ?? null;
        if (seg === segmentId) {
          flat.push({ ...contact, _company: company, companyId: company.id });
        }
      }
    }
    return sortContactsBy(flat, sortMode, companiesById);
  }, [companies, segmentId, sortMode, companiesById]);

  const topSignal = useMemo(() => getTopSignalForSegment(companies, segmentId), [companies, segmentId]);

  return (
    <div id={`laminar-segment-${segmentId}`} className={`rounded-lg p-3 min-h-[600px] border ${SEGMENT_COLOR_BG[segmentId]}`}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-base">{SEGMENT_ICONS[segmentId]}</span>
          <h4 className={`font-semibold text-sm ${SEGMENT_COLOR_ACCENT[segmentId]}`}>{segment.label}</h4>
        </div>
        <Badge variant="outline" className="text-[10px]">{segmentContacts.length}</Badge>
      </div>

      <LaminarWhyNowCard
        topSignal={topSignal}
        segmentId={segmentId}
        onView={(companyId) => {
          const c = companiesById[companyId];
          if (c) onViewCompany(c);
        }}
      />

      <div className="flex items-center gap-1 mb-2">
        <select
          value={sortMode}
          onChange={(e) => onSortChange(segmentId, e.target.value)}
          className="text-[11px] px-1.5 py-1 border border-gray-300 rounded bg-white flex-1"
        >
          <option value="heat">Sort: Heat</option>
          <option value="score">Sort: Score</option>
          <option value="recent">Sort: Recent</option>
          <option value="alpha">Sort: A–Z</option>
        </select>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2"
          disabled={refreshing}
          onClick={() => onRefresh(segmentId)}
          title="Refresh segment"
        >
          {refreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
        </Button>
      </div>

      {refreshing && segmentContacts.length === 0 ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse bg-white/60 h-24 rounded border border-gray-200" />
          ))}
        </div>
      ) : segmentContacts.length === 0 ? (
        <div className="text-center py-6 px-2">
          <div className="text-3xl mb-2">{SEGMENT_ICONS[segmentId]}</div>
          <p className="text-xs text-gray-600 mb-3 leading-relaxed">{segment.description}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRefresh(segmentId)}
            disabled={refreshing}
            className="text-xs"
          >
            <RefreshCw className="w-3 h-3 mr-1" />Find prospects
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {segmentContacts.map((contact, i) => {
            const heat = computeContactHeat(contact, contact._company);
            return (
              <LaminarContactCard
                key={`${segmentId}-${contact._company.id}-${contact.email || i}`}
                contact={contact}
                company={contact._company}
                heat={heat}
                onViewCompany={() => onViewCompany(contact._company)}
                onDraftEmail={onDraftEmail}
                onSchedule={onSchedule}
                onAddToSequence={onAddToSequence}
                getRoleCategoryLabel={getRoleCategoryLabel}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

const LaminarPilotBoard = ({
  companies,
  sortBySegment,
  onSortChange,
  refreshingSegments,
  refreshAllProgress,
  onRefreshSegment,
  onRefreshAll,
  onViewCompany,
  onDraftEmail,
  onSchedule,
  onAddToSequence,
  getRoleCategoryLabel
}) => {
  const handleJumpTo = (segmentId) => {
    const el = document.getElementById(`laminar-segment-${segmentId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Laminar Pilot — Commodity Trading Prospecting</h3>
          <p className="text-sm text-gray-600">
            Working capital intelligence for {companies.length} {companies.length === 1 ? 'company' : 'companies'}.
            Heat-scored contacts grouped by pilot segment.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefreshAll}
          disabled={!!refreshAllProgress}
        >
          {refreshAllProgress
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Refreshing {refreshAllProgress.current}/{refreshAllProgress.total} — {refreshAllProgress.label}…</>
            : <><RefreshCw className="w-4 h-4 mr-2" />Refresh All Segments</>}
        </Button>
      </div>

      <LaminarMetricsBar companies={companies} onJumpToSegment={handleJumpTo} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {LAMINAR_SEGMENT_ORDER.map((segId) => (
          <LaminarSegmentColumn
            key={segId}
            segmentId={segId}
            companies={companies}
            sortMode={sortBySegment[segId] || 'heat'}
            onSortChange={onSortChange}
            refreshing={!!refreshingSegments[segId]}
            onRefresh={onRefreshSegment}
            onViewCompany={onViewCompany}
            onDraftEmail={onDraftEmail}
            onSchedule={onSchedule}
            onAddToSequence={onAddToSequence}
            getRoleCategoryLabel={getRoleCategoryLabel}
          />
        ))}
      </div>
    </div>
  );
};

// Main dashboard wrapper with error boundary and performance optimizations
const DashboardWrapper = () => {
  return (
    <ErrorBoundary>
      <EnhancedLeadGenDashboard />
    </ErrorBoundary>
  );
};

export default DashboardWrapper;
