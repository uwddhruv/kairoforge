'use client';

import { useAppStore } from '@/store/useAppStore';
import { StockCard } from './StockCard';
import { Sparkles, LayoutGrid } from 'lucide-react';

export function ResultsGrid() {
  const { searchResults, isSearching, lastQuery } = useAppStore();

  if (isSearching) return null;

  if (!lastQuery) {
    return (
      <div className="kf-card p-16 text-center">
        <LayoutGrid className="w-12 h-12 text-[#7B5EDB]/30 mx-auto mb-4" />
        <p className="text-[#6b6b80]">Enter a query above to discover stocks</p>
      </div>
    );
  }

  if (searchResults.length === 0) {
    return (
      <div className="kf-card p-16 text-center">
        <Sparkles className="w-12 h-12 text-[#7B5EDB]/30 mx-auto mb-4" />
        <p className="text-white font-medium mb-2">No stocks found for &quot;{lastQuery}&quot;</p>
        <p className="text-[#6b6b80] text-sm">Try a different query or broaden your criteria</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <LayoutGrid className="w-4 h-4 text-[#7B5EDB]" />
        <span className="text-[#6b6b80] text-sm">
          {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for &quot;{lastQuery}&quot;
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {searchResults.map((stock, i) => (
          <StockCard key={stock.symbol} stock={stock} rank={i + 1} />
        ))}
      </div>
      <p className="text-center text-xs text-[#6b6b80] mt-8">
        ⚠️ Results are for informational purposes only. Not financial advice.
      </p>
    </div>
  );
}
