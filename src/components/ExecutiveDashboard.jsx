import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertCircle, TrendingUp, Clock, Shield, Brain, Star,
  ChevronRight, Loader2, AlertTriangle, CheckCircle2,
  Target, Zap, Eye, BarChart3
} from 'lucide-react';

const ExecutiveDashboard = ({ companies = [], onCompanySelect, netlifyAPI }) => {
  const [prioritizedLeads, setPrioritizedLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [aiInsights, setAiInsights] = useState(null);
  const [selectedView, setSelectedView] = useState('priority'); // priority, pipeline, insights

  useEffect(() => {
    if (companies.length > 0) {
      enrichLeadsWithAI();
    }
  }, [companies]);

  const enrichLeadsWithAI = async () => {
    setLoading(true);
    try {
      const enrichedLeads = await Promise.all(
        companies.slice(0, 20).map(async (company) => { // Process top 20
          try {
            // Gather all signals for each company
            const domain = extractDomain(company.website || '');
            if (!domain) return { ...company, aiAnalysis: null };

            const [execData, breachData, regData, surfaceData] = await Promise.allSettled([
              netlifyAPI.getExecutiveMove(domain, company.name),
              netlifyAPI.getBreachProximity(domain, company.industry),
              netlifyAPI.getRegulatoryCountdown(domain, company.industry),
              netlifyAPI.getSurfaceRegression(domain)
            ]);

            // Collect successful signals
            const allSignals = [];
            [execData, breachData, regData, surfaceData].forEach(result => {
              if (result.status === 'fulfilled' && result.value?.success) {
                allSignals.push(...(result.value.signals || []));
              }
            });

            // Get AI analysis
            let aiAnalysis = null;
            if (allSignals.length > 0) {
              const analysisResult = await netlifyAPI.aggregateSignals(
                domain,
                company.name,
                company.industry,
                allSignals
              );

              if (analysisResult?.success) {
                aiAnalysis = analysisResult.analysis;
              }
            }

            // Calculate enhanced score
            const enhancedScore = calculateExecutiveScore(company, allSignals, aiAnalysis);

            return {
              ...company,
              signals: allSignals,
              aiAnalysis,
              executiveScore: enhancedScore.score,
              executivePriority: enhancedScore.priority,
              urgencyReason: enhancedScore.reason,
              businessImpact: enhancedScore.impact
            };

          } catch (error) {
            console.error(`Error enriching ${company.name}:`, error);
            return { ...company, aiAnalysis: null };
          }
        })
      );

      // Sort by executive score (highest first)
      const sortedLeads = enrichedLeads
        .filter(lead => lead.executiveScore !== undefined)
        .sort((a, b) => (b.executiveScore || 0) - (a.executiveScore || 0));

      setPrioritizedLeads(sortedLeads);

      // Generate portfolio insights
      generatePortfolioInsights(sortedLeads);

    } catch (error) {
      console.error('Error enriching leads:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateExecutiveScore = (company, signals, aiAnalysis) => {
    let baseScore = company.leadScore || 50;
    let signalBonus = signals.reduce((sum, signal) => sum + (signal.scoreImpact || 0), 0);
    let aiBonus = aiAnalysis?.urgencyScore ? Math.floor(aiAnalysis.urgencyScore * 0.2) : 0;

    const finalScore = Math.min(100, Math.max(0, baseScore + signalBonus + aiBonus));

    let priority = 'Low';
    let reason = 'Standard lead scoring';
    let impact = 'Medium';

    if (finalScore >= 85) {
      priority = 'Critical';
      reason = aiAnalysis?.aiInsights?.primaryOpportunity || 'High-impact signals detected';
      impact = 'High';
    } else if (finalScore >= 70) {
      priority = 'High';
      reason = 'Multiple positive signals';
      impact = 'Medium-High';
    } else if (finalScore >= 55) {
      priority = 'Medium';
      reason = 'Some opportunity indicators';
      impact = 'Medium';
    }

    return { score: finalScore, priority, reason, impact };
  };

  const generatePortfolioInsights = (leads) => {
    const critical = leads.filter(l => l.executivePriority === 'Critical').length;
    const high = leads.filter(l => l.executivePriority === 'High').length;
    const totalSignals = leads.reduce((sum, l) => sum + (l.signals?.length || 0), 0);

    const topOpportunities = leads.slice(0, 5);

    // Calculate ROI and revenue projections
    const criticalRevenuePotential = critical * 50000; // $50k avg deal size for critical
    const highRevenuePotential = high * 25000; // $25k avg deal size for high
    const totalRevenuePotential = criticalRevenuePotential + highRevenuePotential;

    // Pipeline velocity insights
    const activeSequences = leads.filter(l => l.activeSequence).length;
    const completedOutreach = leads.filter(l => l.outreachHistory?.length > 0).length;
    const conversionRate = completedOutreach > 0 ? Math.round((activeSequences / completedOutreach) * 100) : 0;

    // Market intelligence
    const marketTrends = generateMarketInsights(leads);
    const urgentOpportunities = leads.filter(l =>
      l.signals?.some(s => s.type === 'breach_proximity' || s.type === 'reg_countdown')
    ).length;

    setAiInsights({
      criticalLeads: critical,
      highPriorityLeads: high,
      totalSignals,
      topOpportunities,
      avgScore: Math.round(leads.reduce((sum, l) => sum + l.executiveScore, 0) / leads.length),
      marketTrends,
      revenuePotential: totalRevenuePotential,
      criticalRevenue: criticalRevenuePotential,
      highRevenue: highRevenuePotential,
      activeSequences,
      completedOutreach,
      conversionRate,
      urgentOpportunities,
      keyRecommendations: generateExecutiveRecommendations(leads),
      marketIntelligence: generateMarketIntelligence(leads)
    });
  };

  const generateMarketInsights = (leads) => {
    const industries = {};
    leads.forEach(lead => {
      if (!industries[lead.industry]) industries[lead.industry] = [];
      industries[lead.industry].push(lead);
    });

    return Object.entries(industries)
      .map(([industry, leads]) => ({
        industry,
        count: leads.length,
        avgScore: Math.round(leads.reduce((sum, l) => sum + l.executiveScore, 0) / leads.length),
        trend: leads.filter(l => l.executivePriority === 'Critical' || l.executivePriority === 'High').length > 0 ? 'hot' : 'warm'
      }))
      .sort((a, b) => b.avgScore - a.avgScore);
  };

  const generateExecutiveRecommendations = (leads) => {
    const recommendations = [];

    // Critical opportunity recommendation
    const criticalLeads = leads.filter(l => l.executivePriority === 'Critical');
    if (criticalLeads.length > 0) {
      recommendations.push({
        priority: 'Critical',
        action: 'Immediate Executive Outreach',
        description: `${criticalLeads.length} critical opportunities require executive attention within 48 hours`,
        impact: 'High',
        effort: 'Medium',
        companies: criticalLeads.slice(0, 3).map(l => l.name)
      });
    }

    // Urgent signals recommendation
    const urgentSignals = leads.filter(l =>
      l.signals?.some(s => s.type === 'breach_proximity' || s.type === 'reg_countdown')
    );
    if (urgentSignals.length > 0) {
      recommendations.push({
        priority: 'High',
        action: 'Time-Sensitive Campaign',
        description: `${urgentSignals.length} companies facing urgent compliance/security deadlines`,
        impact: 'High',
        effort: 'Low',
        companies: urgentSignals.slice(0, 3).map(l => l.name)
      });
    }

    // Sequence optimization
    const lowEngagementLeads = leads.filter(l =>
      l.outreachHistory?.length > 0 && !l.activeSequence
    );
    if (lowEngagementLeads.length > 0) {
      recommendations.push({
        priority: 'Medium',
        action: 'Re-engagement Campaign',
        description: `${lowEngagementLeads.length} leads need follow-up sequences`,
        impact: 'Medium',
        effort: 'Low',
        companies: lowEngagementLeads.slice(0, 3).map(l => l.name)
      });
    }

    // Market concentration opportunity
    const industryLeads = generateMarketInsights(leads);
    const topIndustry = industryLeads[0];
    if (topIndustry && topIndustry.count >= 3) {
      recommendations.push({
        priority: 'Medium',
        action: 'Industry-Focused Campaign',
        description: `${topIndustry.count} ${topIndustry.industry} companies show strong signals`,
        impact: 'Medium',
        effort: 'Medium',
        companies: leads.filter(l => l.industry === topIndustry.industry).slice(0, 3).map(l => l.name)
      });
    }

    return recommendations.slice(0, 4); // Top 4 recommendations
  };

  const generateMarketIntelligence = (leads) => {
    // Signal trend analysis
    const signalTypes = {};
    leads.forEach(lead => {
      if (lead.signals) {
        lead.signals.forEach(signal => {
          if (!signalTypes[signal.type]) signalTypes[signal.type] = 0;
          signalTypes[signal.type]++;
        });
      }
    });

    const topSignals = Object.entries(signalTypes)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Geographic concentration
    const locations = {};
    leads.forEach(lead => {
      if (lead.location) {
        const state = lead.location.split(',').pop()?.trim();
        if (state && !locations[state]) locations[state] = 0;
        if (state) locations[state]++;
      }
    });

    const topStates = Object.entries(locations)
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      topSignals,
      topStates,
      trends: [
        'Regulatory compliance deadlines driving urgency',
        'Executive turnover creating security gaps',
        'Insurance renewals forcing security audits',
        'SaaS consolidation projects gaining momentum'
      ]
    };
  };

  const extractDomain = (url) => {
    if (!url) return '';
    try {
      return new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    } catch {
      return url.replace(/^www\./, '');
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'Critical': return 'bg-red-500 text-white';
      case 'High': return 'bg-orange-500 text-white';
      case 'Medium': return 'bg-yellow-500 text-black';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getPriorityIcon = (priority) => {
    switch (priority) {
      case 'Critical': return <AlertTriangle className="w-4 h-4" />;
      case 'High': return <AlertCircle className="w-4 h-4" />;
      case 'Medium': return <Clock className="w-4 h-4" />;
      default: return <CheckCircle2 className="w-4 h-4" />;
    }
  };

  const LeadCard = ({ lead, rank }) => (
    <Card
      className={`cursor-pointer transition-all duration-200 hover:shadow-lg border-l-4 ${
        lead.executivePriority === 'Critical' ? 'border-l-red-500' :
        lead.executivePriority === 'High' ? 'border-l-orange-500' :
        lead.executivePriority === 'Medium' ? 'border-l-yellow-500' : 'border-l-gray-300'
      }`}
      onClick={() => onCompanySelect(lead)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className="bg-blue-100 text-blue-800 text-xs font-bold">#{rank}</Badge>
            <Badge className={`${getPriorityColor(lead.executivePriority)} text-xs font-bold`}>
              {getPriorityIcon(lead.executivePriority)}
              {lead.executivePriority}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-blue-600">{lead.executiveScore}</span>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </div>
        </div>
        <div>
          <CardTitle className="text-lg mb-1">{lead.name}</CardTitle>
          <div className="text-sm text-gray-600">
            {lead.industry} • {lead.employees} employees • {lead.location}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* AI-Generated Executive Summary */}
          {lead.aiAnalysis?.executiveSummary && (
            <div className="bg-blue-50 p-3 rounded-lg">
              <div className="flex items-start gap-2">
                <Brain className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-blue-700 mb-1">AI INSIGHT</div>
                  <div className="text-sm text-blue-800">{lead.aiAnalysis.executiveSummary}</div>
                </div>
              </div>
            </div>
          )}

          {/* Key Signals */}
          {lead.signals && lead.signals.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                <Zap className="w-3 h-3" />
                KEY SIGNALS ({lead.signals.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {lead.signals.slice(0, 3).map((signal, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs">
                    {signal.type.replace('_', ' ')} +{signal.scoreImpact}
                  </Badge>
                ))}
                {lead.signals.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{lead.signals.length - 3} more
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Decision Cards Preview */}
          {lead.aiAnalysis?.decisionCards && (
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-green-50 p-2 rounded">
                <div className="font-semibold text-green-700">Why Now</div>
                <div className="text-green-600">{lead.aiAnalysis.decisionCards.whyNow[0]}</div>
              </div>
              <div className="bg-blue-50 p-2 rounded">
                <div className="font-semibold text-blue-700">First Move</div>
                <div className="text-blue-600">{lead.aiAnalysis.decisionCards.firstMoves[0]}</div>
              </div>
              <div className="bg-red-50 p-2 rounded">
                <div className="font-semibold text-red-700">Risk</div>
                <div className="text-red-600">{lead.aiAnalysis.decisionCards.risksOfWaiting[0]}</div>
              </div>
            </div>
          )}

          {/* Business Impact */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1 text-gray-600">
              <Target className="w-3 h-3" />
              Impact: {lead.businessImpact}
            </div>
            <div className="flex items-center gap-1 text-gray-600">
              <Eye className="w-3 h-3" />
              Confidence: {lead.aiAnalysis?.confidence || 'Medium'}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Executive Header */}
      <Card className="bg-gradient-to-r from-blue-600 to-blue-800 text-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">Executive Lead Intelligence</h1>
              <p className="text-blue-100">AI-powered cybersecurity opportunity prioritization</p>
            </div>
            <div className="text-right">
              {aiInsights && (
                <div className="space-y-1">
                  <div className="text-2xl font-bold">{aiInsights.criticalLeads}</div>
                  <div className="text-sm text-blue-100">Critical Opportunities</div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Executive KPIs */}
      {aiInsights && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-red-600">{aiInsights.criticalLeads}</div>
              <div className="text-sm text-red-700 font-medium">Critical Priority</div>
              <div className="text-xs text-red-600 mt-1">
                ${(aiInsights.criticalRevenue || 0).toLocaleString()} potential
              </div>
            </CardContent>
          </Card>
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-orange-600">{aiInsights.highPriorityLeads}</div>
              <div className="text-sm text-orange-700 font-medium">High Priority</div>
              <div className="text-xs text-orange-600 mt-1">
                ${(aiInsights.highRevenue || 0).toLocaleString()} potential
              </div>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-green-600">
                ${(aiInsights.revenuePotential || 0).toLocaleString()}
              </div>
              <div className="text-sm text-green-700 font-medium">Revenue Potential</div>
              <div className="text-xs text-green-600 mt-1">
                Next 90 days
              </div>
            </CardContent>
          </Card>
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-blue-600">{aiInsights.activeSequences || 0}</div>
              <div className="text-sm text-blue-700 font-medium">Active Sequences</div>
              <div className="text-xs text-blue-600 mt-1">
                {aiInsights.conversionRate || 0}% conversion rate
              </div>
            </CardContent>
          </Card>
          <Card className="border-purple-200 bg-purple-50">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-purple-600">{aiInsights.urgentOpportunities || 0}</div>
              <div className="text-sm text-purple-700 font-medium">Urgent Signals</div>
              <div className="text-xs text-purple-600 mt-1">
                Time-sensitive
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Executive Recommendations */}
      {aiInsights?.keyRecommendations && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-800">
              <Brain className="w-5 h-5" />
              AI-Powered Executive Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {aiInsights.keyRecommendations.map((rec, index) => (
                <Card key={index} className="bg-white">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <Badge className={`${getPriorityColor(rec.priority)} text-xs`}>
                        {rec.priority}
                      </Badge>
                      <div className="text-xs text-gray-500">
                        Impact: {rec.impact} • Effort: {rec.effort}
                      </div>
                    </div>
                    <h4 className="font-semibold text-gray-900 mb-1">{rec.action}</h4>
                    <p className="text-sm text-gray-600 mb-2">{rec.description}</p>
                    <div className="text-xs text-gray-500">
                      Top companies: {rec.companies.join(', ')}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Market Intelligence */}
      {aiInsights?.marketIntelligence && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Signal Trends
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {aiInsights.marketIntelligence.topSignals?.map((signal, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {signal.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                    <Badge variant="outline">{signal.count} companies</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Market Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {aiInsights.marketIntelligence.trends?.map((trend, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                    <span className="text-sm text-gray-700">{trend}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <Card>
          <CardContent className="p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
            <div className="text-lg font-semibold">AI Analysis in Progress...</div>
            <div className="text-sm text-gray-600">Analyzing signals and generating insights</div>
          </CardContent>
        </Card>
      )}

      {/* Prioritized Leads */}
      {!loading && prioritizedLeads.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Priority Queue ({prioritizedLeads.length} leads)</h2>
            <Button
              onClick={enrichLeadsWithAI}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <Brain className="w-4 h-4" />
              Refresh AI Analysis
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {prioritizedLeads.slice(0, 10).map((lead, index) => (
              <LeadCard
                key={lead.id || index}
                lead={lead}
                rank={index + 1}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && companies.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <BarChart3 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <div className="text-lg font-semibold mb-2">No Leads Available</div>
            <div className="text-gray-600">Generate leads to see AI-powered prioritization</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ExecutiveDashboard;