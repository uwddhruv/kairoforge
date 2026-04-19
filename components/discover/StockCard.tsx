'use client';

import Link from 'next/link';
import { BookMarked, TrendingUp, TrendingDown, Plus } from 'lucide-react';
import { useAppStore, type SearchResult } from '@/store/useAppStore';
import { formatCurrency, formatMarketCap } from '@/lib/utils';
import { RankBadge } from './RankBadge';
import { SectorTag } from '../shared/SectorTag';

interface Props {
  stock: SearchResult;
  rank?: number;
}

export function StockCard({ stock, rank }: Props) {
  const { addToWatchlist, removeFromWatchlist, isInWatchlist, addToCompare } = useAppStore();
  const inWatchlist = isInWatchlist(stock.symbol);

  const toggleWatchlist = (e: React.MouseEvent) => {
    e.preventDefault();
    if (inWatchlist) {
      removeFromWatchlist(stock.symbol);
    } else {
      addToWatchlist({ symbol: stock.symbol, name: stock.name, addedAt: Date.now() });
    }
  };

  const handleAddToCompare = (e: React.MouseEvent) => {
    e.preventDefault();
    addToCompare(stock.symbol);
  };

  const price = stock.currentPrice ?? 0;
  const pe = stock.stockPE ?? 0;
  const roe = stock.roe ?? 0;
  const marketCap = stock.marketCap ?? 0;

  return (
    <Link href={`/stock/${stock.symbol}`} className="block group">
      <div className="kf-card-hover p-5 h-full flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {rank && <RankBadge rank={rank} />}
            <div className="min-w-0">
              <div className="font-bold text-white text-base truncate">{stock.symbol}</div>
              <div className="text-xs text-[#6b6b80] truncate">{stock.name}</div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleAddToCompare}
              title="Add to Compare"
              className="p-1.5 rounded-lg text-[#6b6b80] hover:text-[#a78bfa] hover:bg-[#7B5EDB]/10 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={toggleWatchlist}
              title={inWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist'}
              className={`p-1.5 rounded-lg transition-all ${
                inWatchlist
                  ? 'text-[#7B5EDB] bg-[#7B5EDB]/10'
                  : 'text-[#6b6b80] hover:text-[#a78bfa] hover:bg-[#7B5EDB]/10'
              }`}
            >
              <BookMarked className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {stock.sector && <SectorTag sector={stock.sector} />}
          {stock.marketCapCategory && (
            <span className="kf-badge-yellow text-xs">{stock.marketCapCategory}</span>
          )}
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-xs text-[#6b6b80] mb-0.5">Price</div>
            <div className="text-sm font-semibold text-white">
              {price > 0 ? formatCurrency(price) : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-[#6b6b80] mb-0.5">P/E</div>
            <div className={`text-sm font-semibold ${pe > 0 && pe < 25 ? 'text-green-400' : pe > 40 ? 'text-red-400' : 'text-[#e0e0f0]'}`}>
              {pe > 0 ? pe.toFixed(1) : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-[#6b6b80] mb-0.5">ROE %</div>
            <div className={`text-sm font-semibold flex items-center justify-center gap-0.5 ${roe >= 15 ? 'text-green-400' : roe > 0 ? 'text-yellow-400' : 'text-[#6b6b80]'}`}>
              {roe > 0 ? (
                <>
                  {roe >= 15 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {roe.toFixed(1)}
                </>
              ) : '—'}
            </div>
          </div>
        </div>

        {/* Market Cap */}
        {marketCap > 0 && (
          <div className="text-xs text-[#6b6b80] text-center pt-1 border-t border-white/[0.04]">
            MCap: {formatMarketCap(marketCap)}
          </div>
        )}
      </div>
    </Link>
  );
}
