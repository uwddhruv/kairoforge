'use client';

import { useAppStore } from '@/store/useAppStore';
import { StockCard } from '@/components/discover/StockCard';
import { BookMarked, Trash2 } from 'lucide-react';
import Link from 'next/link';
import type { SearchResult } from '@/store/useAppStore';

export default function WatchlistPage() {
  const { watchlist, removeFromWatchlist } = useAppStore();

  const watchlistAsResults: SearchResult[] = watchlist.map(w => ({
    symbol: w.symbol,
    name: w.name,
  }));

  return (
    <div className="min-h-screen pt-20 pb-16 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <BookMarked className="w-5 h-5 text-[#7B5EDB]" />
              <h1 className="text-3xl font-bold text-white">Watchlist</h1>
            </div>
            <p className="text-[#6b6b80]">{watchlist.length} stock{watchlist.length !== 1 ? 's' : ''} tracked</p>
          </div>
          {watchlist.length > 0 && (
            <button
              onClick={() => watchlist.forEach(w => removeFromWatchlist(w.symbol))}
              className="flex items-center gap-2 text-sm text-[#6b6b80] hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Clear All
            </button>
          )}
        </div>

        {watchlist.length === 0 ? (
          <div className="kf-card p-16 text-center">
            <BookMarked className="w-16 h-16 text-[#7B5EDB]/20 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Your watchlist is empty</h2>
            <p className="text-[#6b6b80] mb-6">
              Search for stocks and click the bookmark icon to add them here.
            </p>
            <Link href="/discover" className="kf-button-primary inline-flex items-center gap-2">
              Discover Stocks
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {watchlistAsResults.map((stock, i) => (
              <StockCard key={stock.symbol} stock={stock} rank={i + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
