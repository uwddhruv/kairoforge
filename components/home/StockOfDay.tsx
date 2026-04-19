'use client';

import useSWR from 'swr';
import axios from 'axios';
import Link from 'next/link';
import { Loader2, Star, TrendingUp } from 'lucide-react';
import { formatCurrency, formatMarketCap } from '@/lib/utils';

const fetcher = (url: string) => axios.get(url).then(r => r.data);

export function StockOfDayWidget() {
  const { data, isLoading } = useSWR('/api/stock-of-day', fetcher);

  if (isLoading) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-4xl mx-auto kf-card p-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-[#7B5EDB] animate-spin" />
        </div>
      </section>
    );
  }

  if (!data?.symbol || !data?.stock) return null;

  const { stock, analysis } = data;

  return (
    <section className="py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="kf-card p-6 md:p-8 border-[#7B5EDB]/20 relative overflow-hidden">
          {/* Glow background */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#7B5EDB]/5 rounded-full blur-[80px] pointer-events-none" />

          <div className="flex items-center gap-2 text-[#a78bfa] text-sm font-medium mb-5">
            <Star className="w-4 h-4 fill-current" />
            Stock of the Day
          </div>

          <div className="flex flex-col md:flex-row gap-6">
            {/* Stock info */}
            <div className="shrink-0">
              <div className="bg-[#7B5EDB]/10 rounded-xl p-4 text-center w-full md:w-40">
                <div className="text-2xl font-bold text-white">{stock.symbol}</div>
                <div className="text-xs text-[#6b6b80] mt-1">{stock.sector}</div>
                <div className="text-lg font-semibold text-[#a78bfa] mt-2">
                  {formatCurrency(stock.currentPrice)}
                </div>
                <div className="text-xs text-[#6b6b80] mt-1">{formatMarketCap(stock.marketCap)}</div>
                <Link
                  href={`/stock/${stock.symbol}`}
                  className="mt-3 flex items-center justify-center gap-1 text-xs text-[#7B5EDB] hover:text-[#a78bfa] transition-colors"
                >
                  <TrendingUp className="w-3 h-3" /> View Analysis
                </Link>
              </div>
            </div>

            {/* Analysis */}
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-2">{stock.name}</h3>
              <p className="text-[#a0a0b0] text-sm leading-relaxed whitespace-pre-line">{analysis}</p>
              <div className="flex flex-wrap gap-3 mt-4">
                <div className="text-xs">
                  <span className="text-[#6b6b80]">P/E </span>
                  <span className="text-white font-medium">{stock.stockPE?.toFixed(1) ?? '—'}</span>
                </div>
                <div className="text-xs">
                  <span className="text-[#6b6b80]">ROE </span>
                  <span className="text-green-400 font-medium">{stock.roe?.toFixed(1) ?? '—'}%</span>
                </div>
                <div className="text-xs">
                  <span className="text-[#6b6b80]">ROCE </span>
                  <span className="text-green-400 font-medium">{stock.roce?.toFixed(1) ?? '—'}%</span>
                </div>
                <div className="text-xs">
                  <span className="text-[#6b6b80]">D/E </span>
                  <span className="text-white font-medium">{stock.debtToEquity?.toFixed(2) ?? '—'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
