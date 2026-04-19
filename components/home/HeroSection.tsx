'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, ArrowRight, Search } from 'lucide-react';
import { motion } from 'framer-motion';

const HERO_QUERIES = [
  'Find profitable small-cap IT stocks with low debt',
  'Show mid-cap pharma with high ROCE and dividend',
  'Large cap banking stocks with PE under 15',
  'FMCG stocks with 5-year sales growth above 15%',
];

export function HeroSection() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const handleSearch = (q?: string) => {
    const searchQuery = q ?? query;
    if (!searchQuery.trim()) return;
    router.push(`/discover?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden px-4">
      {/* Background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-[#7B5EDB]/10 rounded-full blur-[120px]" />
        <div className="absolute -bottom-20 -right-20 w-[400px] h-[400px] bg-[#3D2C8D]/15 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#7B5EDB]/5 rounded-full blur-[150px]" />
      </div>

      {/* Grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(rgba(123,94,219,1) 1px, transparent 1px), linear-gradient(90deg, rgba(123,94,219,1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-[#7B5EDB]/10 border border-[#7B5EDB]/20 rounded-full px-4 py-1.5 text-sm text-[#a78bfa] mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            Powered by GPT-4o · Indian Markets
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-4 leading-tight tracking-tight">
            Research Indian Stocks
            <br />
            <span className="kf-gradient-text">with AI Precision</span>
          </h1>

          <p className="text-xl text-[#6b6b80] max-w-2xl mx-auto mb-10 leading-relaxed">
            Ask questions in plain English. Get data-driven fundamental analysis for 1000+ NSE/BSE stocks.
            No jargon. No guesswork.
          </p>

          {/* Search bar */}
          <div className="relative max-w-2xl mx-auto mb-8">
            <div className="flex items-center gap-3 bg-[#111118] border border-white/[0.1] rounded-2xl p-2 focus-within:border-[#7B5EDB]/50 focus-within:shadow-[0_0_30px_rgba(123,94,219,0.1)] transition-all">
              <Search className="w-5 h-5 text-[#6b6b80] ml-2 shrink-0" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Ask about Indian stocks..."
                className="flex-1 bg-transparent text-white placeholder:text-[#6b6b80] outline-none text-base py-2"
              />
              <button
                onClick={() => handleSearch()}
                className="kf-button-primary py-2.5 px-5 text-sm shrink-0"
              >
                <span className="hidden sm:inline">Discover</span>
                <ArrowRight className="w-4 h-4 sm:hidden" />
              </button>
            </div>
          </div>

          {/* Sample queries */}
          <div className="flex flex-wrap justify-center gap-2">
            {HERO_QUERIES.map(q => (
              <button
                key={q}
                onClick={() => handleSearch(q)}
                className="text-xs text-[#6b6b80] bg-white/[0.04] border border-white/[0.06] rounded-full px-3 py-1.5 hover:bg-white/[0.08] hover:text-[#e0e0f0] hover:border-white/[0.12] transition-all"
              >
                {q}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Scroll hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-[#6b6b80]/40 text-xs"
        >
          <div className="w-px h-8 bg-gradient-to-b from-transparent to-[#6b6b80]/30" />
          scroll
        </motion.div>
      </div>
    </section>
  );
}
