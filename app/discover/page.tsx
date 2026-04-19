import { Suspense } from 'react';
import { ChatInput } from '@/components/discover/ChatInput';
import { ResultsGrid } from '@/components/discover/ResultsGrid';
import { LoadingOrb } from '@/components/shared/LoadingOrb';
import { Sparkles } from 'lucide-react';

export default function DiscoverPage() {
  return (
    <div className="min-h-screen pt-20 pb-16 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-[#7B5EDB]/10 border border-[#7B5EDB]/20 rounded-full px-4 py-1.5 text-sm text-[#a78bfa] mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            AI-Powered Stock Discovery
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">
            Ask Anything About <span className="kf-gradient-text">Indian Stocks</span>
          </h1>
          <p className="text-[#6b6b80] text-lg max-w-2xl mx-auto">
            Use natural language to screen stocks. Try &quot;find profitable small-cap IT stocks with low debt&quot;
          </p>
        </div>

        <Suspense fallback={<LoadingOrb />}>
          <ChatInput />
        </Suspense>

        <Suspense fallback={<LoadingOrb />}>
          <ResultsGrid />
        </Suspense>
      </div>
    </div>
  );
}
