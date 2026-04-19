'use client';

import { useState } from 'react';
import useSWR from 'swr';
import axios from 'axios';
import type { Stock } from '@prisma/client';
import { ThumbsUp, ThumbsDown, Loader2, RefreshCw } from 'lucide-react';

interface Props {
  symbol: string;
  stockData: Stock;
}

const fetcher = async ([url, symbol, data]: [string, string, Record<string, unknown>]) => {
  const res = await axios.post(url, { symbol, stockData: data });
  return res.data;
};

export function ProsConsPanel({ symbol, stockData }: Props) {
  const [key, setKey] = useState(0);

  const trimmedData = {
    name: stockData.name,
    sector: stockData.sector,
    marketCapCategory: stockData.marketCapCategory,
    stockPE: stockData.stockPE,
    pbRatio: stockData.pbRatio,
    roe: stockData.roe,
    roce: stockData.roce,
    debtToEquity: stockData.debtToEquity,
    salesGrowth5yr: stockData.salesGrowth5yr,
    profitVar5yr: stockData.profitVar5yr,
    dividendYield: stockData.dividendYield,
    currentRatio: stockData.currentRatio,
    piotroskiScore: stockData.piotroskiScore,
    promoterHolding: stockData.promoterHolding,
    marketCap: stockData.marketCap,
  };

  const { data, isLoading, error } = useSWR(
    [`/api/stock-analysis`, symbol, trimmedData, key],
    ([url, sym, d]) => fetcher([url, sym, d]),
    { revalidateOnFocus: false }
  );

  return (
    <div className="kf-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[#a78bfa] uppercase tracking-wide">
          AI Analysis
        </h3>
        <button
          onClick={() => setKey(k => k + 1)}
          className="p-1.5 rounded-lg text-[#6b6b80] hover:text-white hover:bg-white/[0.04] transition-all"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-[#6b6b80] text-sm py-4">
          <Loader2 className="w-4 h-4 animate-spin text-[#7B5EDB]" />
          Generating analysis...
        </div>
      )}

      {error && !isLoading && (
        <p className="text-[#6b6b80] text-sm">AI analysis unavailable. Please try again.</p>
      )}

      {data && !isLoading && (
        <div className="space-y-4">
          {data.summary && (
            <p className="text-sm text-[#a0a0b0] leading-relaxed">{data.summary}</p>
          )}

          {data.pros?.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-green-400 text-xs font-semibold uppercase tracking-wide mb-2">
                <ThumbsUp className="w-3.5 h-3.5" /> Strengths
              </div>
              <ul className="space-y-1.5">
                {data.pros.map((pro: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[#a0a0b0]">
                    <span className="text-green-400 shrink-0 mt-0.5">✓</span>
                    {pro}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.cons?.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-red-400 text-xs font-semibold uppercase tracking-wide mb-2">
                <ThumbsDown className="w-3.5 h-3.5" /> Concerns
              </div>
              <ul className="space-y-1.5">
                {data.cons.map((con: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[#a0a0b0]">
                    <span className="text-red-400 shrink-0 mt-0.5">✗</span>
                    {con}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.disclaimer && (
            <p className="text-xs text-[#6b6b80] pt-2 border-t border-white/[0.05]">
              ⚠️ {data.disclaimer}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
