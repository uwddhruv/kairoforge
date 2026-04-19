import type { Stock } from '@prisma/client';
import { formatCurrency, formatIndianNumber, formatMarketCap } from '@/lib/utils';
import { MetricBadge } from '../shared/MetricBadge';
import { Info } from 'lucide-react';

interface Props {
  stock: Stock;
}

const METRIC_GROUPS = [
  {
    title: 'Valuation',
    metrics: [
      { key: 'stockPE', label: 'P/E Ratio', fmt: (v: number) => v.toFixed(2), good: (v: number) => v > 0 && v < 25 },
      { key: 'pbRatio', label: 'P/B Ratio', fmt: (v: number) => v.toFixed(2), good: (v: number) => v > 0 && v < 3 },
      { key: 'evEbitda', label: 'EV/EBITDA', fmt: (v: number) => v.toFixed(2), good: (v: number) => v > 0 && v < 15 },
      { key: 'eps', label: 'EPS (₹)', fmt: formatCurrency, good: (v: number) => v > 0 },
      { key: 'grahamNumber', label: 'Graham Number', fmt: formatCurrency, good: (v: number) => v > 0 },
      { key: 'intrinsicValue', label: 'Intrinsic Value', fmt: formatCurrency, good: (v: number) => v > 0 },
    ],
  },
  {
    title: 'Profitability',
    metrics: [
      { key: 'roe', label: 'ROE %', fmt: (v: number) => `${formatIndianNumber(v)}%`, good: (v: number) => v >= 15 },
      { key: 'roce', label: 'ROCE %', fmt: (v: number) => `${formatIndianNumber(v)}%`, good: (v: number) => v >= 15 },
      { key: 'dividendYield', label: 'Div Yield %', fmt: (v: number) => `${v.toFixed(2)}%`, good: (v: number) => v >= 1 },
    ],
  },
  {
    title: 'Growth',
    metrics: [
      { key: 'salesGrowth5yr', label: 'Sales Growth 5yr %', fmt: (v: number) => `${formatIndianNumber(v)}%`, good: (v: number) => v >= 10 },
      { key: 'profitVar5yr', label: 'Profit Growth 5yr %', fmt: (v: number) => `${formatIndianNumber(v)}%`, good: (v: number) => v >= 10 },
      { key: 'pegRatio', label: 'PEG Ratio', fmt: (v: number) => v.toFixed(2), good: (v: number) => v > 0 && v < 1.5 },
    ],
  },
  {
    title: 'Financial Health',
    metrics: [
      { key: 'debtToEquity', label: 'Debt/Equity', fmt: (v: number) => v.toFixed(2), good: (v: number) => v < 0.5 },
      { key: 'currentRatio', label: 'Current Ratio', fmt: (v: number) => v.toFixed(2), good: (v: number) => v >= 1.5 },
      { key: 'quickRatio', label: 'Quick Ratio', fmt: (v: number) => v.toFixed(2), good: (v: number) => v >= 1 },
      { key: 'piotroskiScore', label: 'Piotroski Score', fmt: (v: number) => v.toFixed(0), good: (v: number) => v >= 7 },
      { key: 'freeCashFlow3yr', label: 'FCF 3yr (Cr)', fmt: (v: number) => formatIndianNumber(v), good: (v: number) => v > 0 },
    ],
  },
  {
    title: 'Size & Price',
    metrics: [
      { key: 'marketCap', label: 'Market Cap', fmt: (v: number) => formatMarketCap(v), good: () => true },
      { key: 'currentPrice', label: 'Current Price', fmt: formatCurrency, good: () => true },
      { key: 'high52w', label: '52W High', fmt: formatCurrency, good: () => true },
      { key: 'low52w', label: '52W Low', fmt: formatCurrency, good: () => true },
      { key: 'bookValue', label: 'Book Value', fmt: formatCurrency, good: () => true },
      { key: 'faceValue', label: 'Face Value', fmt: formatCurrency, good: () => true },
    ],
  },
  {
    title: 'Shareholding',
    metrics: [
      { key: 'promoterHolding', label: 'Promoter %', fmt: (v: number) => `${v.toFixed(2)}%`, good: (v: number) => v >= 50 },
      { key: 'fiiHolding', label: 'FII %', fmt: (v: number) => `${v.toFixed(2)}%`, good: (v: number) => v > 5 },
      { key: 'diiHolding', label: 'DII %', fmt: (v: number) => `${v.toFixed(2)}%`, good: (v: number) => v > 3 },
    ],
  },
];

export function MetricsPanel({ stock }: Props) {
  return (
    <div className="space-y-4">
      {METRIC_GROUPS.map(({ title, metrics }) => (
        <div key={title} className="kf-card p-5">
          <h3 className="text-sm font-semibold text-[#a78bfa] uppercase tracking-wide mb-4 flex items-center gap-1.5">
            {title}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {metrics.map(({ key, label, fmt, good }) => {
              const val = (stock as unknown as Record<string, number>)[key] ?? 0;
              const isGood = val !== 0 && good(val);
              const hasValue = val !== 0;
              return (
                <div key={key} className="bg-[#0A0A0F]/50 rounded-xl p-3">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-xs text-[#6b6b80]">{label}</span>
                  </div>
                  <div className={`text-sm font-semibold ${
                    !hasValue ? 'text-[#6b6b80]' : isGood ? 'text-green-400' : 'text-[#e0e0f0]'
                  }`}>
                    {hasValue ? fmt(val) : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
