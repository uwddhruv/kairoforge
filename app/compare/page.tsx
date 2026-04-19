'use client';

import { useState } from 'react';
import axios from 'axios';
import { GitCompare, Plus, X, Loader2 } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { formatCurrency, formatMarketCap, formatIndianNumber } from '@/lib/utils';

interface CompareStock {
  symbol: string;
  name: string;
  currentPrice: number;
  marketCap: number;
  stockPE: number;
  pbRatio: number;
  roe: number;
  roce: number;
  debtToEquity: number;
  dividendYield: number;
  salesGrowth5yr: number;
  profitVar5yr: number;
  promoterHolding: number;
  currentRatio: number;
  eps: number;
  sector: string;
}

const METRICS: { key: keyof CompareStock; label: string; format: (v: number) => string; higherIsBetter: boolean }[] = [
  { key: 'currentPrice', label: 'Price', format: formatCurrency, higherIsBetter: false },
  { key: 'marketCap', label: 'Market Cap', format: (v) => formatMarketCap(v), higherIsBetter: true },
  { key: 'stockPE', label: 'P/E Ratio', format: (v) => v.toFixed(2), higherIsBetter: false },
  { key: 'pbRatio', label: 'P/B Ratio', format: (v) => v.toFixed(2), higherIsBetter: false },
  { key: 'roe', label: 'ROE %', format: (v) => `${formatIndianNumber(v)}%`, higherIsBetter: true },
  { key: 'roce', label: 'ROCE %', format: (v) => `${formatIndianNumber(v)}%`, higherIsBetter: true },
  { key: 'debtToEquity', label: 'Debt/Equity', format: (v) => v.toFixed(2), higherIsBetter: false },
  { key: 'dividendYield', label: 'Dividend Yield %', format: (v) => `${v.toFixed(2)}%`, higherIsBetter: true },
  { key: 'salesGrowth5yr', label: 'Sales Growth 5yr %', format: (v) => `${formatIndianNumber(v)}%`, higherIsBetter: true },
  { key: 'profitVar5yr', label: 'Profit Growth 5yr %', format: (v) => `${formatIndianNumber(v)}%`, higherIsBetter: true },
  { key: 'promoterHolding', label: 'Promoter Holding %', format: (v) => `${v.toFixed(2)}%`, higherIsBetter: true },
  { key: 'currentRatio', label: 'Current Ratio', format: (v) => v.toFixed(2), higherIsBetter: true },
  { key: 'eps', label: 'EPS (₹)', format: formatCurrency, higherIsBetter: true },
];

export default function ComparePage() {
  const { compareList, addToCompare, removeFromCompare, clearCompare } = useAppStore();
  const [inputSymbol, setInputSymbol] = useState('');
  const [stocks, setStocks] = useState<CompareStock[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState('');

  const addSymbol = () => {
    const sym = inputSymbol.trim().toUpperCase();
    if (sym && !compareList.includes(sym) && compareList.length < 4) {
      addToCompare(sym);
      setInputSymbol('');
    }
  };

  const fetchComparison = async () => {
    if (compareList.length < 2) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.post('/api/compare', { symbols: compareList });
      setStocks(data.stocks ?? []);
    } catch {
      setError('Failed to load comparison data.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAIAnalysis = async () => {
    if (stocks.length < 2) return;
    setAiLoading(true);
    try {
      const { data } = await axios.post('/api/compare', { symbols: compareList, includeAI: true });
      setAiAnalysis(data.aiAnalysis ?? '');
    } catch {
      setAiAnalysis('AI analysis unavailable.');
    } finally {
      setAiLoading(false);
    }
  };

  const getBestIndex = (key: keyof CompareStock, higherIsBetter: boolean): number => {
    if (stocks.length === 0) return -1;
    const values = stocks.map(s => Number(s[key]) || 0);
    const valid = values.filter(v => v > 0);
    if (valid.length === 0) return -1;
    const best = higherIsBetter ? Math.max(...values) : Math.min(...valid);
    return values.indexOf(best);
  };

  return (
    <div className="min-h-screen pt-20 pb-16 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <GitCompare className="w-5 h-5 text-[#7B5EDB]" />
            <h1 className="text-3xl font-bold text-white">Compare Stocks</h1>
          </div>
          <p className="text-[#6b6b80]">Compare up to 4 Indian stocks side by side</p>
        </div>

        {/* Add stocks */}
        <div className="kf-card p-6 mb-6">
          <div className="flex gap-3 mb-4">
            <input
              type="text"
              value={inputSymbol}
              onChange={e => setInputSymbol(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && addSymbol()}
              placeholder="Enter symbol (e.g. RELIANCE)"
              className="kf-input flex-1 text-sm"
              maxLength={20}
            />
            <button onClick={addSymbol} className="kf-button-primary flex items-center gap-2 py-2.5 px-5 text-sm">
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {compareList.map(sym => (
              <span key={sym} className="flex items-center gap-2 bg-[#7B5EDB]/10 border border-[#7B5EDB]/20 rounded-full px-3 py-1 text-sm text-[#a78bfa]">
                {sym}
                <button onClick={() => removeFromCompare(sym)}>
                  <X className="w-3.5 h-3.5 hover:text-red-400" />
                </button>
              </span>
            ))}
            {compareList.length > 0 && (
              <button onClick={clearCompare} className="text-xs text-[#6b6b80] hover:text-red-400 transition-colors">
                Clear all
              </button>
            )}
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={fetchComparison}
              disabled={compareList.length < 2 || loading}
              className="kf-button-primary text-sm py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
              Compare
            </button>
            {stocks.length >= 2 && (
              <button
                onClick={fetchAIAnalysis}
                disabled={aiLoading}
                className="bg-[#111118] border border-[#7B5EDB]/30 text-[#a78bfa] rounded-xl px-5 py-2.5 text-sm hover:border-[#7B5EDB]/60 transition-all disabled:opacity-50"
              >
                {aiLoading ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
                ✦ AI Analysis
              </button>
            )}
          </div>
          {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        </div>

        {/* Comparison Table */}
        {stocks.length >= 2 && (
          <div className="kf-card overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left p-4 text-[#6b6b80] font-medium w-48">Metric</th>
                  {stocks.map(s => (
                    <th key={s.symbol} className="text-center p-4 font-semibold text-white">
                      <div>{s.symbol}</div>
                      <div className="text-xs text-[#6b6b80] font-normal">{s.sector}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRICS.map(({ key, label, format, higherIsBetter }) => {
                  const bestIdx = getBestIndex(key, higherIsBetter);
                  return (
                    <tr key={key} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="p-4 text-[#6b6b80]">{label}</td>
                      {stocks.map((s, i) => {
                        const val = Number(s[key]) || 0;
                        const isBest = i === bestIdx && val > 0;
                        return (
                          <td key={s.symbol} className={`p-4 text-center font-medium ${isBest ? 'text-green-400' : 'text-[#e0e0f0]'}`}>
                            {val > 0 ? format(val) : '—'}
                            {isBest && <span className="ml-1 text-xs">★</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* AI Analysis */}
        {aiAnalysis && (
          <div className="kf-card p-6">
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <span className="text-[#7B5EDB]">✦</span> AI Comparison Analysis
            </h3>
            <p className="text-[#a0a0b0] text-sm leading-relaxed whitespace-pre-line">{aiAnalysis}</p>
          </div>
        )}

        <p className="text-center text-xs text-[#6b6b80] mt-8">
          ⚠️ Comparison is for informational purposes only. Not financial advice. ★ indicates best value.
        </p>
      </div>
    </div>
  );
}
