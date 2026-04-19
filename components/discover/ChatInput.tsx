'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import { Search, Sparkles, Loader2, ArrowRight } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

export function ChatInput() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setSearchResults, setIsSearching, setLastQuery } = useAppStore();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-run if q param exists
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setQuery(q);
      runSearch(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = async (q?: string) => {
    const searchQuery = q ?? query;
    if (!searchQuery.trim()) return;

    setLoading(true);
    setIsSearching(true);
    setLastQuery(searchQuery);
    setExplanation('');

    try {
      const { data } = await axios.post('/api/screener', { query: searchQuery });
      setSearchResults(data.results ?? []);
      if (data.explanation) setExplanation(data.explanation);
      // Update URL without page reload
      router.replace(`/discover?q=${encodeURIComponent(searchQuery)}`, { scroll: false });
    } catch {
      setSearchResults([]);
    } finally {
      setLoading(false);
      setIsSearching(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto mb-8">
      <div className="relative">
        <div className="flex items-center gap-3 bg-[#111118] border border-white/[0.1] rounded-2xl p-2
          focus-within:border-[#7B5EDB]/50 focus-within:shadow-[0_0_30px_rgba(123,94,219,0.1)] transition-all">
          <div className="p-2 rounded-xl bg-[#7B5EDB]/10 shrink-0">
            <Sparkles className="w-4 h-4 text-[#7B5EDB]" />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && runSearch()}
            placeholder="Ask about Indian stocks in plain English..."
            className="flex-1 bg-transparent text-white placeholder:text-[#6b6b80] outline-none text-base py-2"
          />
          <button
            onClick={() => runSearch()}
            disabled={loading || !query.trim()}
            className="kf-button-primary py-2.5 px-5 text-sm shrink-0 flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline">Search</span>
                <ArrowRight className="w-4 h-4 sm:hidden" />
              </>
            )}
          </button>
        </div>
      </div>

      {explanation && (
        <p className="text-xs text-[#6b6b80] mt-2.5 ml-2 flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-[#7B5EDB]" />
          {explanation}
        </p>
      )}
    </div>
  );
}
