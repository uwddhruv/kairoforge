'use client';

import { useState, useCallback } from 'react';
import axios from 'axios';
import { Filter, SlidersHorizontal, Search } from 'lucide-react';
import { StockCard } from '@/components/discover/StockCard';
import { LoadingOrb } from '@/components/shared/LoadingOrb';
import type { SearchResult } from '@/store/useAppStore';

const SECTORS = [
  'All', 'IT', 'Banking', 'FMCG', 'Pharma', 'Auto',
  'Metals', 'Energy', 'Infra', 'Realty', 'Telecom',
];

const CAP_CATEGORIES = ['All', 'Large Cap', 'Mid Cap', 'Small Cap'];

export default function ScreenerPage() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [sector, setSector] = useState('All');
  const [capCat, setCapCat] = useState('All');
  const [minROE, setMinROE] = useState('');
  const [maxPE, setMaxPE] = useState('');
  const [maxDebt, setMaxDebt] = useState('');
  const [minDivYield, setMinDivYield] = useState('');
  const [sortBy, setSortBy] = useState('marketCap');
  const [hasSearched, setHasSearched] = useState(false);

  const runScreener = useCallback(async () => {
    setLoading(true);
    setHasSearched(true);
    try {
      const params: Record<string, string> = { sortBy, sortOrder: 'desc' };
      if (sector !== 'All') params.sector = sector;
      if (capCat !== 'All') params.marketCapCategory = capCat;
      if (minROE) params.minROE = minROE;
      if (maxPE) params.maxPE = maxPE;
      if (maxDebt) params.maxDebt = maxDebt;
      if (minDivYield) params.minDividendYield = minDivYield;

      const { data } = await axios.get('/api/screener', { params });
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [sector, capCat, minROE, maxPE, maxDebt, minDivYield, sortBy]);

  return (
    <div className="min-h-screen pt-20 pb-16 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <SlidersHorizontal className="w-5 h-5 text-[#7B5EDB]" />
            <h1 className="text-3xl font-bold text-white">Stock Screener</h1>
          </div>
          <p className="text-[#6b6b80]">Filter Indian stocks by fundamental criteria</p>
        </div>

        {/* Filters */}
        <div className="kf-card p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
            {/* Sector */}
            <div>
              <label className="block text-sm text-[#6b6b80] mb-1.5">Sector</label>
              <select
                value={sector}
                onChange={e => setSector(e.target.value)}
                className="kf-input w-full text-sm"
              >
                {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {/* Market Cap */}
            <div>
              <label className="block text-sm text-[#6b6b80] mb-1.5">Market Cap</label>
              <select
                value={capCat}
                onChange={e => setCapCat(e.target.value)}
                className="kf-input w-full text-sm"
              >
                {CAP_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {/* Min ROE */}
            <div>
              <label className="block text-sm text-[#6b6b80] mb-1.5">Min ROE (%)</label>
              <input
                type="number"
                value={minROE}
                onChange={e => setMinROE(e.target.value)}
                placeholder="e.g. 15"
                className="kf-input w-full text-sm"
              />
            </div>
            {/* Max PE */}
            <div>
              <label className="block text-sm text-[#6b6b80] mb-1.5">Max P/E</label>
              <input
                type="number"
                value={maxPE}
                onChange={e => setMaxPE(e.target.value)}
                placeholder="e.g. 25"
                className="kf-input w-full text-sm"
              />
            </div>
            {/* Max Debt/Equity */}
            <div>
              <label className="block text-sm text-[#6b6b80] mb-1.5">Max Debt/Equity</label>
              <input
                type="number"
                value={maxDebt}
                onChange={e => setMaxDebt(e.target.value)}
                placeholder="e.g. 1.0"
                className="kf-input w-full text-sm"
              />
            </div>
            {/* Min Dividend Yield */}
            <div>
              <label className="block text-sm text-[#6b6b80] mb-1.5">Min Dividend Yield (%)</label>
              <input
                type="number"
                value={minDivYield}
                onChange={e => setMinDivYield(e.target.value)}
                placeholder="e.g. 2.0"
                className="kf-input w-full text-sm"
              />
            </div>
            {/* Sort By */}
            <div>
              <label className="block text-sm text-[#6b6b80] mb-1.5">Sort By</label>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="kf-input w-full text-sm"
              >
                <option value="marketCap">Market Cap</option>
                <option value="roe">ROE</option>
                <option value="roce">ROCE</option>
                <option value="stockPE">P/E Ratio</option>
                <option value="dividendYield">Dividend Yield</option>
                <option value="salesGrowth5yr">Sales Growth 5yr</option>
              </select>
            </div>
          </div>

          <button
            onClick={runScreener}
            disabled={loading}
            className="kf-button-primary flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            {loading ? 'Screening...' : 'Run Screener'}
          </button>
        </div>

        {/* Results */}
        {loading && <LoadingOrb />}

        {!loading && hasSearched && (
          <>
            <div className="flex items-center gap-2 mb-4">
              <Filter className="w-4 h-4 text-[#7B5EDB]" />
              <span className="text-[#6b6b80] text-sm">{results.length} stocks found</span>
            </div>
            {results.length === 0 ? (
              <div className="kf-card p-12 text-center text-[#6b6b80]">
                No stocks match your filters. Try relaxing some criteria.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {results.map((stock, i) => (
                  <StockCard key={stock.symbol} stock={stock} rank={i + 1} />
                ))}
              </div>
            )}
          </>
        )}

        {!hasSearched && (
          <div className="kf-card p-12 text-center">
            <SlidersHorizontal className="w-12 h-12 text-[#7B5EDB]/40 mx-auto mb-4" />
            <p className="text-[#6b6b80]">Set your filters and run the screener to discover stocks</p>
          </div>
        )}

        <p className="text-center text-xs text-[#6b6b80] mt-8">
          ⚠️ Screener results are for research only. Not financial advice.
        </p>
      </div>
    </div>
  );
}
