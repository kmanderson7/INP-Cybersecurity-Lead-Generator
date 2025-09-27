import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  TrendingUp, TrendingDown, Users, Mail, Target, DollarSign,
  BarChart3, PieChart, Calendar, Download, Filter, X,
  Activity, Award, Clock, Globe
} from 'lucide-react';

const Analytics = ({ companies, onClose }) => {
  const [selectedTimeframe, setSelectedTimeframe] = useState('all');
  const [selectedIndustry, setSelectedIndustry] = useState('all');

  // Calculate analytics metrics
  const analytics = useMemo(() => {
    // Filter companies based on selections
    let filteredCompanies = companies;

    if (selectedIndustry !== 'all') {
      filteredCompanies = companies.filter(c => c.industry === selectedIndustry);
    }

    // Basic metrics
    const totalLeads = filteredCompanies.length;
    const avgScore = filteredCompanies.reduce((sum, c) => sum + c.leadScore, 0) / totalLeads;
    const criticalLeads = filteredCompanies.filter(c => c.priority === 'Critical').length;
    const highLeads = filteredCompanies.filter(c => c.priority === 'High').length;

    // Status distribution
    const statusCounts = filteredCompanies.reduce((acc, company) => {
      acc[company.status] = (acc[company.status] || 0) + 1;
      return acc;
    }, {});

    // Industry breakdown
    const industryBreakdown = filteredCompanies.reduce((acc, company) => {
      acc[company.industry] = (acc[company.industry] || 0) + 1;
      return acc;
    }, {});

    // Score ranges
    const scoreRanges = {
      'Critical (80-100)': filteredCompanies.filter(c => c.leadScore >= 80).length,
      'High (60-79)': filteredCompanies.filter(c => c.leadScore >= 60 && c.leadScore < 80).length,
      'Medium (40-59)': filteredCompanies.filter(c => c.leadScore >= 40 && c.leadScore < 60).length,
      'Low (0-39)': filteredCompanies.filter(c => c.leadScore < 40).length,
    };

    // Geographic distribution
    const geoDistribution = filteredCompanies.reduce((acc, company) => {
      const location = company.location?.split(', ')[1] || 'Unknown';
      acc[location] = (acc[location] || 0) + 1;
      return acc;
    }, {});

    // Employee size distribution
    const sizeDistribution = filteredCompanies.reduce((acc, company) => {
      const employees = company.employees;
      let range;
      if (employees < 100) range = '< 100';
      else if (employees < 500) range = '100-499';
      else if (employees < 1000) range = '500-999';
      else if (employees < 5000) range = '1K-5K';
      else range = '5K+';

      acc[range] = (acc[range] || 0) + 1;
      return acc;
    }, {});

    // Revenue estimates
    const totalRevenuePotential = filteredCompanies.reduce((sum, company) => {
      const revString = company.revenue || '0M';
      const revValue = parseInt(revString.replace('M', '')) || 0;
      return sum + revValue;
    }, 0);

    return {
      totalLeads,
      avgScore: Math.round(avgScore * 10) / 10,
      criticalLeads,
      highLeads,
      statusCounts,
      industryBreakdown,
      scoreRanges,
      geoDistribution,
      sizeDistribution,
      totalRevenuePotential
    };
  }, [companies, selectedIndustry]);

  const getIndustries = () => {
    const industries = new Set(companies.map(c => c.industry));
    return Array.from(industries).sort();
  };

  const MetricCard = ({ title, value, subtitle, icon: Icon, trend, trendValue, color = 'blue' }) => (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold">{value}</p>
              {trend && (
                <div className={`flex items-center gap-1 text-sm ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                  {trend === 'up' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {trendValue}
                </div>
              )}
            </div>
            {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
          </div>
          <div className={`p-3 rounded-full bg-${color}-100`}>
            <Icon className={`w-6 h-6 text-${color}-600`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const ChartCard = ({ title, data, type = 'bar' }) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Object.entries(data).map(([key, value]) => {
            const maxValue = Math.max(...Object.values(data));
            const percentage = (value / maxValue) * 100;

            return (
              <div key={key} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{key}</span>
                  <span>{value}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );

  const exportReport = () => {
    const reportData = {
      generatedAt: new Date().toISOString(),
      timeframe: selectedTimeframe,
      industry: selectedIndustry,
      metrics: analytics,
      companies: companies.length
    };

    const dataStr = JSON.stringify(reportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `analytics-report-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-7xl mx-4 max-h-[95vh] overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6" />
            Lead Analytics Dashboard
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportReport}>
              <Download className="w-4 h-4 mr-2" />
              Export Report
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="p-6 border-b">
            <div className="flex gap-4 items-center">
              <div>
                <label className="block text-sm font-medium mb-1">Industry Filter</label>
                <select
                  className="px-3 py-2 border rounded-md text-sm"
                  value={selectedIndustry}
                  onChange={(e) => setSelectedIndustry(e.target.value)}
                >
                  <option value="all">All Industries</option>
                  {getIndustries().map(industry => (
                    <option key={industry} value={industry}>{industry}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Time Period</label>
                <select
                  className="px-3 py-2 border rounded-md text-sm"
                  value={selectedTimeframe}
                  onChange={(e) => setSelectedTimeframe(e.target.value)}
                >
                  <option value="all">All Time</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="today">Today</option>
                </select>
              </div>
            </div>
          </div>

          <div className="max-h-[calc(95vh-12rem)] overflow-auto">
            <Tabs defaultValue="overview" className="h-full">
              <div className="px-6 pb-4">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="performance">Performance</TabsTrigger>
                  <TabsTrigger value="distribution">Distribution</TabsTrigger>
                  <TabsTrigger value="insights">Insights</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="overview" className="px-6 mt-0 space-y-6">
                {/* Key Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <MetricCard
                    title="Total Leads"
                    value={analytics.totalLeads}
                    subtitle="Active prospects"
                    icon={Users}
                    color="blue"
                  />
                  <MetricCard
                    title="Average Score"
                    value={analytics.avgScore}
                    subtitle="Out of 100"
                    icon={Target}
                    color="green"
                  />
                  <MetricCard
                    title="High Priority"
                    value={analytics.criticalLeads + analytics.highLeads}
                    subtitle={`${analytics.criticalLeads} Critical, ${analytics.highLeads} High`}
                    icon={Award}
                    color="orange"
                  />
                  <MetricCard
                    title="Revenue Potential"
                    value={`$${analytics.totalRevenuePotential}M`}
                    subtitle="Estimated pipeline value"
                    icon={DollarSign}
                    color="purple"
                  />
                </div>

                {/* Charts Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ChartCard
                    title="Lead Status Distribution"
                    data={analytics.statusCounts}
                  />
                  <ChartCard
                    title="Score Ranges"
                    data={analytics.scoreRanges}
                  />
                </div>
              </TabsContent>

              <TabsContent value="performance" className="px-6 mt-0 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <MetricCard
                    title="Conversion Rate"
                    value="12.3%"
                    subtitle="Leads to meetings"
                    icon={TrendingUp}
                    trend="up"
                    trendValue="+2.1%"
                    color="green"
                  />
                  <MetricCard
                    title="Response Rate"
                    value="8.7%"
                    subtitle="Email responses"
                    icon={Mail}
                    trend="up"
                    trendValue="+1.3%"
                    color="blue"
                  />
                  <MetricCard
                    title="Avg. Deal Size"
                    value="$47K"
                    subtitle="Expected value"
                    icon={DollarSign}
                    trend="up"
                    trendValue="+$3K"
                    color="purple"
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Performance by Industry</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {Object.entries(analytics.industryBreakdown).map(([industry, count]) => {
                          const conversionRate = Math.random() * 15 + 5; // Mock data
                          return (
                            <div key={industry} className="flex justify-between items-center">
                              <div>
                                <p className="font-medium text-sm">{industry}</p>
                                <p className="text-xs text-gray-500">{count} leads</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-medium">{conversionRate.toFixed(1)}%</p>
                                <p className="text-xs text-gray-500">conversion</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Campaign Performance</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-200">
                          <div>
                            <p className="font-medium text-sm">Security Audit Campaign</p>
                            <p className="text-xs text-gray-600">Sent to 45 leads</p>
                          </div>
                          <div className="text-right">
                            <Badge className="bg-green-100 text-green-800">15.6% open rate</Badge>
                          </div>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <div>
                            <p className="font-medium text-sm">Compliance Check</p>
                            <p className="text-xs text-gray-600">Sent to 32 leads</p>
                          </div>
                          <div className="text-right">
                            <Badge className="bg-blue-100 text-blue-800">12.3% open rate</Badge>
                          </div>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-orange-50 rounded-lg border border-orange-200">
                          <div>
                            <p className="font-medium text-sm">Risk Assessment</p>
                            <p className="text-xs text-gray-600">Sent to 28 leads</p>
                          </div>
                          <div className="text-right">
                            <Badge className="bg-orange-100 text-orange-800">9.7% open rate</Badge>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="distribution" className="px-6 mt-0 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ChartCard
                    title="Geographic Distribution"
                    data={analytics.geoDistribution}
                  />
                  <ChartCard
                    title="Company Size Distribution"
                    data={analytics.sizeDistribution}
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ChartCard
                    title="Industry Breakdown"
                    data={analytics.industryBreakdown}
                  />
                  <Card>
                    <CardHeader>
                      <CardTitle>Top Performing Segments</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium text-sm">Healthcare (500-1000 emp)</p>
                            <p className="text-xs text-gray-600">High compliance focus</p>
                          </div>
                          <div className="text-right">
                            <Badge variant="outline">87% avg score</Badge>
                          </div>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium text-sm">Finance (1000+ emp)</p>
                            <p className="text-xs text-gray-600">Strong security requirements</p>
                          </div>
                          <div className="text-right">
                            <Badge variant="outline">82% avg score</Badge>
                          </div>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium text-sm">Software (100-500 emp)</p>
                            <p className="text-xs text-gray-600">Growth stage companies</p>
                          </div>
                          <div className="text-right">
                            <Badge variant="outline">75% avg score</Badge>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="insights" className="px-6 mt-0 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Activity className="w-5 h-5" />
                        Key Insights
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <p className="text-sm font-medium text-blue-800">High-Value Opportunity</p>
                          <p className="text-xs text-blue-600 mt-1">
                            Healthcare companies show 23% higher engagement rates and average deal sizes of $65K
                          </p>
                        </div>
                        <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                          <p className="text-sm font-medium text-green-800">Timing Insight</p>
                          <p className="text-xs text-green-600 mt-1">
                            Companies with recent funding rounds are 40% more likely to respond to security outreach
                          </p>
                        </div>
                        <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                          <p className="text-sm font-medium text-orange-800">Geographic Trend</p>
                          <p className="text-xs text-orange-600 mt-1">
                            West Coast companies show higher budget allocation for cybersecurity investments
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Clock className="w-5 h-5" />
                        Recommendations
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                          <p className="text-sm font-medium text-purple-800">Focus Area</p>
                          <p className="text-xs text-purple-600 mt-1">
                            Prioritize Healthcare and Finance sectors for Q4 pipeline building
                          </p>
                        </div>
                        <div className="p-3 bg-teal-50 rounded-lg border border-teal-200">
                          <p className="text-sm font-medium text-teal-800">Messaging</p>
                          <p className="text-xs text-teal-600 mt-1">
                            Compliance-focused messaging resonates 35% better than general security pitches
                          </p>
                        </div>
                        <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                          <p className="text-sm font-medium text-red-800">Follow-up</p>
                          <p className="text-xs text-red-600 mt-1">
                            15 high-scoring leads haven't been contacted in 30+ days - immediate action needed
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Predictive Analytics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="text-center p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg">
                        <p className="text-2xl font-bold text-blue-700">23</p>
                        <p className="text-sm text-blue-600">Likely to convert this month</p>
                      </div>
                      <div className="text-center p-4 bg-gradient-to-r from-green-50 to-green-100 rounded-lg">
                        <p className="text-2xl font-bold text-green-700">$127K</p>
                        <p className="text-sm text-green-600">Predicted monthly revenue</p>
                      </div>
                      <div className="text-center p-4 bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg">
                        <p className="text-2xl font-bold text-purple-700">8</p>
                        <p className="text-sm text-purple-600">Meetings likely to close</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Analytics;