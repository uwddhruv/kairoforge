'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { Search, BookMarked, GitCompare, SlidersHorizontal, Sparkles, Menu, X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { KAIROFORGE_LOGO_URL } from '@/lib/branding';

const NAV_LINKS = [
  { href: '/discover', label: 'Discover', icon: Sparkles },
  { href: '/screener', label: 'Screener', icon: SlidersHorizontal },
  { href: '/compare', label: 'Compare', icon: GitCompare },
  { href: '/watchlist', label: 'Watchlist', icon: BookMarked },
];

interface SearchResult {
  symbol: string;
  name: string;
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const { watchlist } = useAppStore();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setResults([]);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await axios.get(`/api/search?q=${encodeURIComponent(query)}`);
        setResults(data.results ?? []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const goToStock = (symbol: string) => {
    router.push(`/stock/${symbol}`);
    setQuery('');
    setResults([]);
    setSearchOpen(false);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0A0A0F]/80 backdrop-blur-xl border-b border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Image
            src={KAIROFORGE_LOGO_URL}
            alt="KairoForge logo"
            width={32}
            height={32}
            className="w-8 h-8 rounded-lg object-cover"
          />
          <div className="hidden sm:flex flex-col leading-none">
            <span className="font-bold text-white text-lg leading-tight">KairoForge</span>
            <span className="text-[#6b6b80] text-[10px] font-medium tracking-widest uppercase leading-tight">
              Equity Intelligence Terminal
            </span>
          </div>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${
                pathname === href
                  ? 'bg-[#7B5EDB]/15 text-[#a78bfa]'
                  : 'text-[#6b6b80] hover:text-[#e0e0f0] hover:bg-white/[0.04]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {href === '/watchlist' && watchlist.length > 0 && (
                <span className="ml-1 bg-[#7B5EDB] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {watchlist.length}
                </span>
              )}
            </Link>
          ))}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2">
          <div ref={searchRef} className="relative">
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="p-2 rounded-xl text-[#6b6b80] hover:text-white hover:bg-white/[0.06] transition-all"
            >
              <Search className="w-4 h-4" />
            </button>
            {searchOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-[#111118] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
                <div className="flex items-center gap-2 p-3 border-b border-white/[0.06]">
                  <Search className="w-4 h-4 text-[#6b6b80]" />
                  <input
                    autoFocus
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search stocks..."
                    className="bg-transparent flex-1 text-sm text-white placeholder:text-[#6b6b80] outline-none"
                  />
                  {searching && <div className="w-3.5 h-3.5 border-2 border-[#7B5EDB] border-t-transparent rounded-full animate-spin" />}
                </div>
                {results.length > 0 && (
                  <div className="max-h-64 overflow-y-auto">
                    {results.map(r => (
                      <button
                        key={r.symbol}
                        onClick={() => goToStock(r.symbol)}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.04] transition-colors text-left"
                      >
                        <span className="text-white text-sm font-medium">{r.symbol}</span>
                        <span className="text-[#6b6b80] text-xs truncate ml-2 max-w-[150px]">{r.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {query.length >= 2 && results.length === 0 && !searching && (
                  <div className="p-4 text-center text-[#6b6b80] text-sm">No stocks found</div>
                )}
              </div>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-xl text-[#6b6b80] hover:text-white hover:bg-white/[0.06] transition-all"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/[0.06] bg-[#0A0A0F]/95 backdrop-blur-xl">
          <div className="px-4 py-3 space-y-1">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  pathname === href
                    ? 'bg-[#7B5EDB]/15 text-[#a78bfa]'
                    : 'text-[#6b6b80] hover:text-[#e0e0f0] hover:bg-white/[0.04]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
