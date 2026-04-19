import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface WatchlistItem {
  symbol: string;
  name: string;
  addedAt: number;
}

export interface SearchResult {
  symbol: string;
  name: string;
  sector?: string;
  marketCapCategory?: string;
  currentPrice?: number;
  stockPE?: number;
  roe?: number;
  roce?: number;
  marketCap?: number;
}

interface AppState {
  // Watchlist
  watchlist: WatchlistItem[];
  addToWatchlist: (item: WatchlistItem) => void;
  removeFromWatchlist: (symbol: string) => void;
  isInWatchlist: (symbol: string) => boolean;

  // Discover / Screener
  lastQuery: string;
  setLastQuery: (query: string) => void;
  searchResults: SearchResult[];
  setSearchResults: (results: SearchResult[]) => void;
  isSearching: boolean;
  setIsSearching: (v: boolean) => void;

  // Compare
  compareList: string[];
  addToCompare: (symbol: string) => void;
  removeFromCompare: (symbol: string) => void;
  clearCompare: () => void;

  // UI
  theme: 'dark';
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      watchlist: [],
      addToWatchlist: (item) =>
        set(state => ({
          watchlist: state.watchlist.some(w => w.symbol === item.symbol)
            ? state.watchlist
            : [...state.watchlist, item],
        })),
      removeFromWatchlist: (symbol) =>
        set(state => ({
          watchlist: state.watchlist.filter(w => w.symbol !== symbol),
        })),
      isInWatchlist: (symbol) => get().watchlist.some(w => w.symbol === symbol),

      lastQuery: '',
      setLastQuery: (query) => set({ lastQuery: query }),
      searchResults: [],
      setSearchResults: (results) => set({ searchResults: results }),
      isSearching: false,
      setIsSearching: (v) => set({ isSearching: v }),

      compareList: [],
      addToCompare: (symbol) =>
        set(state => ({
          compareList:
            state.compareList.length >= 4 || state.compareList.includes(symbol)
              ? state.compareList
              : [...state.compareList, symbol],
        })),
      removeFromCompare: (symbol) =>
        set(state => ({ compareList: state.compareList.filter(s => s !== symbol) })),
      clearCompare: () => set({ compareList: [] }),

      theme: 'dark',
    }),
    {
      name: 'kairoforge-store',
      partialize: (state) => ({
        watchlist: state.watchlist,
        lastQuery: state.lastQuery,
        compareList: state.compareList,
      }),
    }
  )
);
