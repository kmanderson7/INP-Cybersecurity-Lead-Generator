import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Zap, Compass, AlertTriangle } from 'lucide-react';
import { getCompanyWorkingCapital, formatCurrencyShort } from '@/lib/laminarMetrics';

const cardCache = new Map();
const FALLBACK_BANNER_KEY = 'laminar-decision-cards-fallback-dismissed';

export default function LaminarDecisionCards({ company, laminarAI }) {
  const [state, setState] = useState({ loading: true, data: null, error: null, fallback: false });
  const [showFallbackBanner, setShowFallbackBanner] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.sessionStorage.getItem(FALLBACK_BANNER_KEY) !== '1';
  });

  useEffect(() => {
    if (!company?.id) return;

    if (cardCache.has(company.id)) {
      const cached = cardCache.get(company.id);
      setState({ loading: false, data: cached.data, error: null, fallback: cached.fallback });
      return;
    }

    let cancelled = false;
    setState({ loading: true, data: null, error: null, fallback: false });

    const wc = getCompanyWorkingCapital(company);
    const topSignal = (Array.isArray(company.signals) ? company.signals : [])
      .sort((a, b) => (b.scoreImpact || 0) - (a.scoreImpact || 0))[0];

    const payload = {
      company: company.name || company.company || 'Unknown',
      segment: company.segment || (() => {
        const matchingContact = (company.contacts || []).find((contact) => contact.segment || contact.sourceMeta?.segment);
        return matchingContact?.segment || matchingContact?.sourceMeta?.segment || 'energy_traders';
      })(),
      workingCapitalLocked: wc?.locked ? wc.locked.toLocaleString() : '0',
      topSignal: topSignal?.details || 'no recent signal',
      signalDate: topSignal?.occurredAt || 'n/a',
      score: company.leadScore || 0,
      priority: company.priority || 'Medium',
      recentNews: (company.news || []).slice(0, 2).map((n) => n.title).join(' | ') || 'no recent news',
      contactTitles: (company.contacts || []).slice(0, 5).map((c) => c.title).filter(Boolean).join(', ') || 'unknown roles'
    };

    laminarAI('decisionCards', payload)
      .then((res) => {
        if (cancelled) return;
        try {
          const text = res?.result || '';
          const parsed = JSON.parse(text);
          const nextState = { data: parsed, fallback: res?.meta?.live === false };
          cardCache.set(company.id, nextState);
          setState({ loading: false, data: nextState.data, error: null, fallback: nextState.fallback });
        } catch {
          const fallback = {
            whyNow: payload.topSignal !== 'no recent signal' ? `${payload.topSignal} creates a timely opening.` : 'Working capital math is timely with current settlement cycles.',
            firstMove: `Open with the working-capital figure: ${wc ? formatCurrencyShort(wc.locked) : 'estimated total'} locked in settlement.`,
            risk: `Waiting 30-60 days delays ${wc ? formatCurrencyShort(wc.locked) : 'significant capital'} that could be on the balance sheet.`
          };
          cardCache.set(company.id, { data: fallback, fallback: true });
          setState({ loading: false, data: fallback, error: null, fallback: true });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        const wcLocal = getCompanyWorkingCapital(company);
        const fallback = {
          whyNow: 'Live AI unavailable. Working-capital math remains timely with current settlement cycles.',
          firstMove: `Open with the working-capital figure: ${wcLocal ? formatCurrencyShort(wcLocal.locked) : 'estimated total'} locked in settlement.`,
          risk: `Waiting delays capital release for ${company.name || 'this account'}.`
        };
        setState({ loading: false, data: fallback, error: err.message, fallback: true });
      });

    return () => { cancelled = true; };
  }, [company?.id, laminarAI]);

  if (state.loading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating decision cards...
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {[1, 2, 3].map((index) => (
              <div key={index} className="rounded border border-gray-200 p-3 space-y-2">
                <div className="h-3 w-20 rounded bg-gray-200 animate-pulse" />
                <div className="h-3 w-full rounded bg-gray-200 animate-pulse" />
                <div className="h-3 w-5/6 rounded bg-gray-200 animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!state.data) return null;

  return (
    <div className="space-y-2">
      {state.fallback && showFallbackBanner && (
        <div className="flex items-start justify-between gap-3 text-[11px] px-3 py-1.5 bg-amber-50 border border-amber-200 rounded text-amber-800">
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="p-3 rounded border-l-4 border-l-green-500 bg-green-50">
          <div className="flex items-center gap-1 text-[11px] font-bold text-green-800 mb-1"><Zap className="w-3 h-3" />WHY NOW</div>
          <div className="text-xs text-gray-800">{state.data.whyNow}</div>
        </div>
        <div className="p-3 rounded border-l-4 border-l-blue-500 bg-blue-50">
          <div className="flex items-center gap-1 text-[11px] font-bold text-blue-800 mb-1"><Compass className="w-3 h-3" />FIRST MOVE</div>
          <div className="text-xs text-gray-800">{state.data.firstMove}</div>
        </div>
        <div className="p-3 rounded border-l-4 border-l-red-500 bg-red-50">
          <div className="flex items-center gap-1 text-[11px] font-bold text-red-800 mb-1"><AlertTriangle className="w-3 h-3" />RISK</div>
          <div className="text-xs text-gray-800">{state.data.risk}</div>
        </div>
      </div>
    </div>
  );
}
