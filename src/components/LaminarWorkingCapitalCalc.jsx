import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DollarSign, ArrowRight } from 'lucide-react';
import { computeWorkingCapital, formatCurrency, formatCurrencyShort } from '@/lib/laminarMetrics';

export default function LaminarWorkingCapitalCalc({ company, onCopyToOutreach }) {
  const initial = useMemo(() => ({
    cargoes: Number(company?.annualCargoes ?? company?.insights?.cargoes ?? 0),
    value: Number(company?.avgCargoValue ?? company?.insights?.avgCargoValue ?? 0),
    currentDays: 20,
    targetDays: 1
  }), [company?.id]);

  const [cargoes, setCargoes] = useState(initial.cargoes);
  const [value, setValue] = useState(initial.value);
  const [currentDays, setCurrentDays] = useState(initial.currentDays);
  const [targetDays, setTargetDays] = useState(initial.targetDays);

  useEffect(() => {
    setCargoes(initial.cargoes);
    setValue(initial.value);
    setCurrentDays(initial.currentDays);
    setTargetDays(initial.targetDays);
  }, [initial]);

  const current = computeWorkingCapital(cargoes, value, currentDays);
  const target = computeWorkingCapital(cargoes, value, targetDays);
  const freed = current.locked - target.locked;
  const hasInputs = cargoes > 0 && value > 0;

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-amber-600" />
          Working Capital Calculator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-gray-700 mb-1">Annual Cargoes</label>
            <Input type="number" value={cargoes || ''} onChange={(e) => setCargoes(Number(e.target.value))} className="text-sm" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-700 mb-1">Avg Cargo Value ($)</label>
            <Input type="number" value={value || ''} onChange={(e) => setValue(Number(e.target.value))} className="text-sm" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-700 mb-1">Current Cycle (days)</label>
            <Input type="number" value={currentDays} onChange={(e) => setCurrentDays(Number(e.target.value))} className="text-sm" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-700 mb-1">Laminar Cycle (days)</label>
            <Input type="number" value={targetDays} onChange={(e) => setTargetDays(Number(e.target.value))} className="text-sm" />
          </div>
        </div>

        {!hasInputs ? (
          <div className="text-xs text-gray-500 italic px-3 py-3 bg-gray-50 rounded">
            Fill in cargo volume and value to see working capital impact.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <div className="p-3 bg-gray-50 rounded border border-gray-200">
              <div className="text-[11px] font-semibold text-gray-600 mb-1">Working Capital Locked (current)</div>
              <div className="text-2xl font-bold text-gray-900">{formatCurrency(current.locked)}</div>
              <div className="text-[11px] text-gray-500">{currentDays}-day settlement cycle</div>
            </div>
            <div className="p-3 bg-amber-50 rounded border border-amber-300">
              <div className="text-[11px] font-semibold text-amber-700 mb-1 flex items-center gap-1">
                <ArrowRight className="w-3 h-3" />Working Capital Freed (Laminar)
              </div>
              <div className="text-2xl font-bold text-amber-700">{formatCurrency(freed)}</div>
              <div className="text-[11px] text-amber-600">{targetDays}-day target settlement cycle</div>
            </div>
            <div className="p-3 bg-gray-50 rounded border border-gray-200">
              <div className="text-[11px] font-semibold text-gray-600 mb-1">Annual LC Cost (0.5%–2%)</div>
              <div className="text-base font-semibold text-gray-900">{formatCurrencyShort(current.lcCostLow)} – {formatCurrencyShort(current.lcCostHigh)}</div>
            </div>
            <div className="p-3 bg-amber-50 rounded border border-amber-300">
              <div className="text-[11px] font-semibold text-amber-700 mb-1">Annual Savings Estimate</div>
              <div className="text-base font-semibold text-amber-700">{formatCurrencyShort(current.lcCostLow)} – {formatCurrencyShort(current.lcCostHigh)}</div>
            </div>
          </div>
        )}

        {hasInputs && onCopyToOutreach && (
          <div className="flex justify-end pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onCopyToOutreach({
                annualCargoes: cargoes,
                avgCargoValue: value,
                settlementDays: currentDays,
                laminarDays: targetDays,
                workingCapitalLocked: current.locked,
                workingCapitalFreed: freed
              })}
            >
              Copy to Outreach
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
