import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Droplets, Warehouse, ClipboardCheck, FileText } from 'lucide-react';
import { inferPillarReadiness } from '@/lib/laminarMetrics';

const STATUS_STYLES = {
  compatible: { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-700', dot: 'bg-green-500', label: 'Compatible' },
  likely: { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-700', dot: 'bg-yellow-500', label: 'Likely' },
  unknown: { bg: 'bg-gray-50', border: 'border-gray-300', text: 'text-gray-500', dot: 'bg-gray-400', label: 'Unknown' },
  incompatible: { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-700', dot: 'bg-red-500', label: 'Incompatible' }
};

const PILLARS = [
  { key: 'pipeline', icon: Droplets, label: 'Pipeline Nomination' },
  { key: 'storage', icon: Warehouse, label: 'Storage Verified' },
  { key: 'inspection', icon: ClipboardCheck, label: 'Inspection Certificate' },
  { key: 'billOfLading', icon: FileText, label: 'Bill of Lading' }
];

export default function LaminarPillarReadiness({ company }) {
  const readiness = useMemo(() => inferPillarReadiness(company), [company]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Four-Pillar Settlement Readiness</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          {PILLARS.map(({ key, icon: Icon, label }) => {
            const r = readiness[key] || { status: 'unknown', note: '' };
            const style = STATUS_STYLES[r.status] || STATUS_STYLES.unknown;
            return (
              <div key={key} className={`p-3 rounded border ${style.bg} ${style.border}`}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Icon className={`w-4 h-4 ${style.text}`} />
                  <span className={`text-[11px] font-semibold ${style.text}`}>{label}</span>
                </div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                  <span className={`text-xs font-bold ${style.text}`}>{style.label}</span>
                </div>
                <div className="text-[10px] text-gray-600 leading-tight">{r.note}</div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
