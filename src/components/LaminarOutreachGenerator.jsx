import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, AlertTriangle, Mail } from 'lucide-react';
import { getCompanyWorkingCapital, formatCurrencyShort } from '@/lib/laminarMetrics';

const FORBIDDEN_WORDS = [
  'crypto', 'cryptocurrency', 'blockchain', 'XRP', 'XRPL',
  'NFT', 'token', 'ledger', 'DeFi', 'Web3', 'digital asset'
];

const REPLACEMENTS = {
  crypto: '(omit — this is finance, not crypto)',
  cryptocurrency: '(omit)',
  blockchain: '"programmable settlement" or "settlement rail"',
  xrp: '(omit; call it "the network")',
  xrpl: '(omit)',
  nft: '"digital title document"',
  token: '"settlement instrument" or "settlement unit"',
  ledger: '"settlement record"',
  defi: '(omit)',
  web3: '(omit)',
  'digital asset': '(omit)'
};

export function checkOutreachGuardrails(text) {
  const lower = (text || '').toLowerCase();
  return FORBIDDEN_WORDS.filter((word) => {
    const regex = new RegExp(`\\b${word.toLowerCase()}\\b`);
    return regex.test(lower);
  });
}

const PERSONAS = [
  { value: 'CFO', label: 'CFO' },
  { value: 'Treasurer', label: 'Treasurer' },
  { value: 'Head of Trade Finance', label: 'Head of Trade Finance' },
  { value: 'Operations Director', label: 'Operations Director' },
  { value: 'Chief Risk Officer', label: 'Chief Risk Officer' }
];

const TONES = [
  { value: 'Executive', label: 'Executive' },
  { value: 'Peer', label: 'Peer' },
  { value: 'Urgent', label: 'Urgent' }
];

const FALLBACK_BANNER_KEY = 'laminar-outreach-fallback-dismissed';

export default function LaminarOutreachGenerator({ company, contextOverride = null, laminarAI, onSendEmail }) {
  const [persona, setPersona] = useState('CFO');
  const [tone, setTone] = useState('Executive');
  const [variants, setVariants] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fallback, setFallback] = useState(false);
  const [showFallbackBanner, setShowFallbackBanner] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.sessionStorage.getItem(FALLBACK_BANNER_KEY) !== '1';
  });

  useEffect(() => {
    setVariants(null);
    setError(null);
    setFallback(false);
  }, [company?.id, contextOverride?.companyId]);

  const generate = async () => {
    if (!company) return;
    setLoading(true);
    setError(null);
    setFallback(false);

    const wc = getCompanyWorkingCapital(company);
    const topSignal = (Array.isArray(company.signals) ? company.signals : [])
      .sort((a, b) => (b.scoreImpact || 0) - (a.scoreImpact || 0))[0];
    const primaryContact = (company.contacts || [])[0] || {};
    const lockedValue = contextOverride?.workingCapitalLocked ?? wc?.locked ?? 0;
    const lcCostLow = contextOverride?.lcCostLow ?? wc?.lcCostLow ?? 0;
    const lcCostHigh = contextOverride?.lcCostHigh ?? wc?.lcCostHigh ?? 0;

    const payload = {
      company: company.name || 'Unknown',
      contactName: primaryContact.name || 'there',
      contactTitle: primaryContact.title || persona,
      persona,
      tone,
      annualCargoes: contextOverride?.annualCargoes ?? company.annualCargoes ?? 'unknown',
      avgCargoValue: contextOverride?.avgCargoValue ?? company.avgCargoValue ?? 'unknown',
      workingCapitalLocked: lockedValue ? Number(lockedValue).toLocaleString() : '0',
      lcCostLow: lcCostLow ? Number(lcCostLow).toLocaleString() : '0',
      lcCostHigh: lcCostHigh ? Number(lcCostHigh).toLocaleString() : '0',
      currentSettlementMethod: company.currentSettlementMethod?.join?.(', ') || 'Letter of Credit',
      topSignal: topSignal?.details || 'no recent signal',
      recentNews: (company.news || []).slice(0, 2).map((n) => n.title).join(' | ') || 'no recent news',
      region: company.location || company.region || 'unknown'
    };

    try {
      const res = await laminarAI('outreach', payload);
      const text = res?.result || '';
      try {
        const parsed = JSON.parse(text);
        setVariants(parsed);
        setFallback(res?.meta?.live === false);
      } catch {
        setError('AI output was not valid JSON. Falling back to template.');
        setVariants(buildLocalFallback(payload));
        setFallback(true);
      }
    } catch (e) {
      setError(e.message || 'AI dispatch failed');
      setVariants(buildLocalFallback(payload));
      setFallback(true);
    } finally {
      setLoading(false);
    }
  };

  const updateVariant = (key, field, value) => {
    setVariants((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="w-4 h-4 text-amber-600" />
          Laminar Outreach Generator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Persona</label>
            <select
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            >
              {PERSONAS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Tone</label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            >
              {TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <Button
              onClick={generate}
              disabled={loading}
              className="w-full bg-amber-600 hover:bg-amber-700"
            >
              {loading
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating outreach…</>
                : 'Generate 2 Variants'}
            </Button>
          </div>
        </div>

        {error && (
          <div className="text-xs px-3 py-2 bg-red-50 border border-red-200 rounded text-red-800">
            {error}
          </div>
        )}
        {fallback && variants && showFallbackBanner && (
          <div className="flex items-start justify-between gap-3 text-xs px-3 py-2 bg-amber-50 border border-amber-200 rounded text-amber-800">
            <span>Live AI unavailable — showing template-based content. Refresh to retry.</span>
            <button
              type="button"
              className="font-semibold underline underline-offset-2"
              onClick={() => {
                setShowFallbackBanner(false);
                if (typeof window !== 'undefined') {
                  window.sessionStorage.setItem(FALLBACK_BANNER_KEY, '1');
                }
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        {variants && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <VariantPanel
              title="Variant A"
              variant={variants.variant_a}
              onChange={(field, value) => updateVariant('variant_a', field, value)}
              onSend={() => onSendEmail?.(company, variants.variant_a, persona, tone)}
            />
            <VariantPanel
              title="Variant B"
              variant={variants.variant_b}
              onChange={(field, value) => updateVariant('variant_b', field, value)}
              onSend={() => onSendEmail?.(company, variants.variant_b, persona, tone)}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VariantPanel({ title, variant, onChange, onSend }) {
  if (!variant) return null;
  const violations = [
    ...checkOutreachGuardrails(variant.subject || ''),
    ...checkOutreachGuardrails(variant.body || '')
  ];
  const uniqueViolations = [...new Set(violations.map((v) => v.toLowerCase()))];

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">{title}</div>
        <Button size="sm" variant="outline" onClick={onSend}>Use {title.split(' ')[1]}</Button>
      </div>

      {uniqueViolations.length > 0 && (
        <div className="mb-2 px-2 py-1.5 bg-yellow-50 border border-yellow-300 rounded text-[11px] text-yellow-900">
          <div className="flex items-center gap-1 font-semibold mb-1">
            <AlertTriangle className="w-3 h-3" />Restricted terminology detected
          </div>
          {uniqueViolations.map((word) => (
            <div key={word}>
              <span className="font-mono">{word}</span> → {REPLACEMENTS[word] || '(remove)'}
            </div>
          ))}
        </div>
      )}

      <label className="block text-[11px] font-semibold text-gray-700 mb-1">Subject</label>
      <Input
        value={variant.subject || ''}
        onChange={(e) => onChange('subject', e.target.value)}
        className="text-sm mb-2"
      />
      <label className="block text-[11px] font-semibold text-gray-700 mb-1">Body</label>
      <Textarea
        value={variant.body || ''}
        onChange={(e) => onChange('body', e.target.value)}
        rows={8}
        className="text-sm"
      />
    </div>
  );
}

function buildLocalFallback(payload) {
  return {
    variant_a: {
      subject: `$${payload.workingCapitalLocked} working capital locked at ${payload.company}`,
      body: `Hi ${payload.contactName},\n\n$${payload.workingCapitalLocked} sitting in your settlement pipeline right now. Programmable settlement releases that same-day.\n\nNothing changes for the trader. Your ${payload.persona} still approves credit.\n\nWorth 20 minutes?\n\n— Kirk Anderson`
    },
    variant_b: {
      subject: `${payload.company}: from 20-day to same-day settlement`,
      body: `Hi ${payload.contactName},\n\n10x credit velocity on the same balance sheet — that's what same-day settlement does for ${payload.company}.\n\nNothing changes for the trader.\n\nWorth 20 minutes?\n\n— Kirk Anderson`
    }
  };
}
