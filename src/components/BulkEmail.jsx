import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { getSourceBadge } from '@/lib/sourceMeta';
import {
  Mail, X, CheckSquare, Square, Users, Send, Eye, Filter,
  AlertCircle, CheckCircle, Clock, Loader2, Target
} from 'lucide-react';

const BulkEmail = ({ companies, onClose, netlifyAPI }) => {
  const [selectedLeads, setSelectedLeads] = useState(new Set());
  const [emailTemplate, setEmailTemplate] = useState({
    subject: '',
    body: '',
    persona: 'CFO',
    tone: 'professional'
  });
  const [activeTab, setActiveTab] = useState('compose');
  const [isSending, setIsSending] = useState(false);
  const [sendStatus, setSendStatus] = useState({}); // leadId -> status
  const [previewLead, setPreviewLead] = useState(null);
  const [filters, setFilters] = useState({
    industry: 'all',
    priority: 'all',
    minScore: 0
  });

  // Filter companies based on criteria
  const filteredCompanies = companies.filter(company => {
    if (filters.industry !== 'all' && company.industry !== filters.industry) return false;
    if (filters.priority !== 'all' && company.priority !== filters.priority) return false;
    if (company.leadScore < filters.minScore) return false;
    return true;
  });

  const getUniqueIndustries = (companies) => {
    const industries = new Set();
    companies.forEach(company => {
      if (company.industry) industries.add(company.industry);
    });
    return Array.from(industries).sort();
  };

  const toggleLeadSelection = (leadId) => {
    const newSelected = new Set(selectedLeads);
    if (newSelected.has(leadId)) {
      newSelected.delete(leadId);
    } else {
      newSelected.add(leadId);
    }
    setSelectedLeads(newSelected);
  };

  const selectAll = () => {
    setSelectedLeads(new Set(filteredCompanies.map(c => c.id)));
  };

  const selectNone = () => {
    setSelectedLeads(new Set());
  };

  const generatePersonalizedEmail = (company, persona, tone) => {
    const executive = company.executives?.[0];
    const executiveTitle = executive?.title || 'Finance Decision Maker';
    const toneContext = tone === 'urgent'
      ? 'This is time-sensitive because settlement friction compounds quickly.'
      : tone === 'casual'
        ? 'Thought this might be useful for a quick comparison against peer teams.'
        : 'Keeping this concise and focused on operating impact.';

    const personaFocus = {
      CFO: 'capital efficiency and liquidity planning',
      'Head of Trade Finance': 'process friction and settlement timing',
      'Settlement Manager': 'reconciliation quality and exception handling',
      'Operations Lead': 'workflow throughput and tooling gaps'
    };

    return `Dear ${executive?.name || executiveTitle},

I’m reaching out because ${company.name} appears to have trade finance and settlement complexity where small process improvements can materially reduce friction.

Based on our research, we’ve identified a few areas worth reviewing:

${company.concerns?.slice(0, 2).map(concern => `• ${concern}`).join('\n')}

Given your role in ${personaFocus[persona]} at ${company.name}, a short conversation about current operating friction could be useful.

${toneContext}

Our team helps firms improve settlement flow, reduce manual rework, and tighten operational control without adding more overhead.

Would you be open to a 15-minute call next week to compare notes on liquidity impact, settlement risk, and workflow bottlenecks?

Best regards,
[Your Name]
Laminar Digital

P.S. If useful, I can share a short framework for spotting reconciliation delays, approval bottlenecks, and hidden working-capital drag.`;
  };

  const sendBulkEmails = async () => {
    if (selectedLeads.size === 0) {
      alert('Please select at least one lead');
      return;
    }

    if (!emailTemplate.subject || !emailTemplate.body) {
      alert('Please fill in both subject and body');
      return;
    }

    setIsSending(true);
    const newSendStatus = {};

    // Initialize all selected leads as "sending"
    selectedLeads.forEach(leadId => {
      newSendStatus[leadId] = 'sending';
    });
    setSendStatus(newSendStatus);

    const selectedCompanies = filteredCompanies.filter(c => selectedLeads.has(c.id));

    for (const company of selectedCompanies) {
      try {
        const executive = company.executives?.[0];
        if (!executive?.email) {
          newSendStatus[company.id] = 'failed';
          setSendStatus({...newSendStatus});
          continue;
        }

        // Personalize email for each company
        const personalizedBody = generatePersonalizedEmail(company, emailTemplate.persona, emailTemplate.tone);
        const personalizedSubject = emailTemplate.subject.replace('{company}', company.name);

        const result = await netlifyAPI.sendEmail(
          executive.email,
          personalizedSubject,
          personalizedBody,
          company.id,
          emailTemplate.persona,
          emailTemplate.tone
        );

        newSendStatus[company.id] = result?.success ? 'sent' : 'failed';
        setSendStatus({...newSendStatus});

        // Small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`Failed to send email to ${company.name}:`, error);
        newSendStatus[company.id] = 'failed';
        setSendStatus({...newSendStatus});
      }
    }

    setIsSending(false);
    setActiveTab('results');
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'sending': return <Clock className="w-4 h-4 text-blue-500" />;
      case 'sent': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <AlertCircle className="w-4 h-4 text-red-500" />;
      default: return null;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'sending': return 'Sending...';
      case 'sent': return 'Sent';
      case 'failed': return 'Failed';
      default: return 'Pending';
    }
  };

  const sentCount = Object.values(sendStatus).filter(s => s === 'sent').length;
  const failedCount = Object.values(sendStatus).filter(s => s === 'failed').length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-6xl mx-4 max-h-[90vh] overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Bulk Email Campaign
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
            <div className="px-6 pb-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="select">
                  Select Leads ({selectedLeads.size})
                </TabsTrigger>
                <TabsTrigger value="compose">
                  Compose Email
                </TabsTrigger>
                <TabsTrigger value="preview">
                  Preview
                </TabsTrigger>
                <TabsTrigger value="results">
                  Results {sentCount > 0 && `(${sentCount}/${selectedLeads.size})`}
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="max-h-[calc(90vh-12rem)] overflow-auto">
              <TabsContent value="select" className="px-6 mt-0 space-y-4">
                {/* Filters */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Filter className="w-4 h-4" />
                      Lead Filters
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Industry</label>
                        <select
                          className="w-full px-3 py-2 border rounded-md text-sm"
                          value={filters.industry}
                          onChange={(e) => setFilters(prev => ({ ...prev, industry: e.target.value }))}
                        >
                          <option value="all">All Industries</option>
                          {getUniqueIndustries(companies).map(industry => (
                            <option key={industry} value={industry}>{industry}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Priority</label>
                        <select
                          className="w-full px-3 py-2 border rounded-md text-sm"
                          value={filters.priority}
                          onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value }))}
                        >
                          <option value="all">All Priorities</option>
                          <option value="Critical">Critical</option>
                          <option value="High">High</option>
                          <option value="Medium">Medium</option>
                          <option value="Low">Low</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Min Score</label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={filters.minScore}
                          onChange={(e) => setFilters(prev => ({ ...prev, minScore: parseInt(e.target.value) || 0 }))}
                          className="text-sm"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Selection Controls */}
                <div className="flex justify-between items-center">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={selectAll}>
                      <CheckSquare className="w-4 h-4 mr-1" />
                      Select All ({filteredCompanies.length})
                    </Button>
                    <Button size="sm" variant="outline" onClick={selectNone}>
                      <Square className="w-4 h-4 mr-1" />
                      Clear Selection
                    </Button>
                  </div>
                  <div className="text-sm text-gray-600">
                    {selectedLeads.size} of {filteredCompanies.length} leads selected
                  </div>
                </div>

                {/* Lead List */}
                <div className="space-y-2 max-h-96 overflow-auto">
                  {filteredCompanies.map(company => (
                    <Card
                      key={company.id}
                      className={`cursor-pointer transition-all hover:shadow-sm ${
                        selectedLeads.has(company.id) ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                      }`}
                      onClick={() => toggleLeadSelection(company.id)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center">
                              {selectedLeads.has(company.id) ? (
                                <CheckSquare className="w-4 h-4 text-blue-600" />
                              ) : (
                                <Square className="w-4 h-4 text-gray-400" />
                              )}
                            </div>
                            <div>
                              <h4 className="font-semibold text-sm">{company.name}</h4>
                              <p className="text-xs text-gray-600">
                                {company.industry} • {company.employees} employees • {company.executives?.[0]?.email}
                              </p>
                              <Badge variant="outline" className={`mt-2 text-[10px] ${getSourceBadge(company.sourceMeta).className}`}>
                                {getSourceBadge(company.sourceMeta).label}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              className={`text-xs ${
                                company.priority === 'Critical' ? 'bg-red-100 text-red-800' :
                                company.priority === 'High' ? 'bg-orange-100 text-orange-800' :
                                company.priority === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {company.priority}
                            </Badge>
                            <div className="text-sm font-medium">
                              {company.leadScore}/100
                            </div>
                            {sendStatus[company.id] && getStatusIcon(sendStatus[company.id])}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="compose" className="px-6 mt-0 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Target Persona</label>
                    <select
                      className="w-full px-3 py-2 border rounded-md"
                      value={emailTemplate.persona}
                      onChange={(e) => setEmailTemplate(prev => ({ ...prev, persona: e.target.value }))}
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
                      value={emailTemplate.tone}
                      onChange={(e) => setEmailTemplate(prev => ({ ...prev, tone: e.target.value }))}
                    >
                      <option value="professional">Professional</option>
                      <option value="casual">Casual</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Subject Line</label>
                  <Input
                    value={emailTemplate.subject}
                    onChange={(e) => setEmailTemplate(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder="Use {company} for company name personalization"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Tip: Use {'{company}'} to automatically insert company names
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Email Template</label>
                  <Textarea
                    value={emailTemplate.body}
                    onChange={(e) => setEmailTemplate(prev => ({ ...prev, body: e.target.value }))}
                    rows={15}
                    placeholder="Email will be personalized for each company with their specific concerns, tech stack, and executive information..."
                    className="resize-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    This template will be automatically personalized for each selected company with their specific concerns, technology stack, and executive details.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="preview" className="px-6 mt-0 space-y-4">
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium mb-1">Preview for Company:</label>
                    <select
                      className="w-full px-3 py-2 border rounded-md"
                      value={previewLead?.id || ''}
                      onChange={(e) => {
                        const lead = filteredCompanies.find(c => c.id === parseInt(e.target.value));
                        setPreviewLead(lead);
                      }}
                    >
                      <option value="">Select a company to preview...</option>
                      {filteredCompanies
                        .filter(c => selectedLeads.has(c.id))
                        .map(company => (
                          <option key={company.id} value={company.id}>
                            {company.name}
                          </option>
                        ))
                      }
                    </select>
                  </div>
                </div>

                {previewLead && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Email Preview - {previewLead.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">To:</label>
                          <p className="text-sm">{previewLead.executives?.[0]?.email}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Subject:</label>
                          <p className="text-sm">{emailTemplate.subject.replace('{company}', previewLead.name)}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Body:</label>
                          <div className="bg-gray-50 p-4 rounded-md text-sm whitespace-pre-wrap border">
                            {generatePersonalizedEmail(previewLead, emailTemplate.persona, emailTemplate.tone)}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="results" className="px-6 mt-0 space-y-4">
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <Send className="w-5 h-5 text-blue-500" />
                        <div>
                          <p className="text-sm text-gray-600">Total Sent</p>
                          <p className="text-2xl font-bold">{sentCount}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-red-500" />
                        <div>
                          <p className="text-sm text-gray-600">Failed</p>
                          <p className="text-2xl font-bold">{failedCount}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <Target className="w-5 h-5 text-green-500" />
                        <div>
                          <p className="text-sm text-gray-600">Success Rate</p>
                          <p className="text-2xl font-bold">
                            {selectedLeads.size > 0 ? Math.round((sentCount / selectedLeads.size) * 100) : 0}%
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-2">
                  {filteredCompanies
                    .filter(c => selectedLeads.has(c.id))
                    .map(company => (
                      <Card key={company.id} className="p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-semibold text-sm">{company.name}</h4>
                            <p className="text-xs text-gray-600">{company.executives?.[0]?.email}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(sendStatus[company.id])}
                            <span className="text-sm">{getStatusText(sendStatus[company.id])}</span>
                          </div>
                        </div>
                      </Card>
                    ))
                  }
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </CardContent>

        <div className="p-6 border-t bg-gray-50">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              {selectedLeads.size} leads selected
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              {activeTab === 'select' && (
                <Button
                  onClick={() => setActiveTab('compose')}
                  disabled={selectedLeads.size === 0}
                >
                  Next: Compose Email
                </Button>
              )}
              {activeTab === 'compose' && (
                <Button
                  onClick={() => setActiveTab('preview')}
                  disabled={!emailTemplate.subject || !emailTemplate.body}
                >
                  Next: Preview
                </Button>
              )}
              {activeTab === 'preview' && (
                <Button
                  onClick={sendBulkEmails}
                  disabled={isSending || selectedLeads.size === 0}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending ({sentCount}/{selectedLeads.size})
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send to {selectedLeads.size} Leads
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default BulkEmail;
