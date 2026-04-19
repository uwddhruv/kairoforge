'use client';

import useSWR from 'swr';
import axios from 'axios';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface NSEIndex {
  index: string;
  last: number;
  percentChange: number;
}

const fetcher = (url: string) => axios.get(url).then(r => r.data);

export function MarketMood() {
  const { data } = useSWR('/api/market-indices', fetcher, { refreshInterval: 60000 });

  const indices: NSEIndex[] = data?.indices ?? [];
  const status = data?.status ?? { open: false, message: 'Loading...' };

  return (
    <section className="py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="kf-card p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {/* Status indicator */}
          <div className="flex items-center gap-2 shrink-0">
            <div className={`w-2 h-2 rounded-full ${status.open ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            <span className={`text-sm font-medium ${status.open ? 'text-green-400' : 'text-red-400'}`}>
              {status.message}
            </span>
          </div>

          {indices.length > 0 && (
            <>
              <div className="hidden sm:block w-px h-6 bg-white/[0.08]" />
              <div className="flex flex-wrap gap-4">
                {indices.map(idx => (
                  <div key={idx.index} className="flex items-center gap-2">
                    <span className="text-[#6b6b80] text-xs">{idx.index}</span>
                    <span className="text-white text-sm font-medium">
                      {idx.last.toLocaleString('en-IN')}
                    </span>
                    <span className={`text-xs flex items-center gap-0.5 ${
                      idx.percentChange > 0 ? 'text-green-400' : idx.percentChange < 0 ? 'text-red-400' : 'text-gray-400'
                    }`}>
                      {idx.percentChange > 0 ? <TrendingUp className="w-3 h-3" /> :
                       idx.percentChange < 0 ? <TrendingDown className="w-3 h-3" /> :
                       <Minus className="w-3 h-3" />}
                      {Math.abs(idx.percentChange).toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {indices.length === 0 && (
            <span className="text-[#6b6b80] text-sm">Market data unavailable</span>
          )}
        </div>
      </div>
    </section>
  );
}
