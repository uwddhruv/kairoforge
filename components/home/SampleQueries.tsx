'use client';

import { useRouter } from 'next/navigation';

const QUERIES = [
  { label: 'Low PE value stocks', q: 'stocks with PE below 15 and positive ROE' },
  { label: 'High ROE large caps', q: 'large cap stocks with ROE above 20%' },
  { label: 'Debt-free small caps', q: 'debt-free small cap stocks with good growth' },
  { label: 'High dividend yield', q: 'stocks with dividend yield above 3%' },
  { label: 'IT sector leaders', q: 'top IT companies by market cap' },
  { label: 'Pharma growth', q: 'pharma stocks with 5-year profit growth above 15%' },
  { label: 'Banking value', q: 'banking stocks with PB below 1.5' },
  { label: 'FMCG moats', q: 'FMCG stocks with high ROCE and consistent growth' },
];

export function SampleQueries() {
  const router = useRouter();

  return (
    <section className="py-12 px-4 bg-[#0D0D14]">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-center text-sm text-[#6b6b80] uppercase tracking-widest mb-6">
          Popular Queries
        </h2>
        <div className="flex flex-wrap justify-center gap-3">
          {QUERIES.map(({ label, q }) => (
            <button
              key={label}
              onClick={() => router.push(`/discover?q=${encodeURIComponent(q)}`)}
              className="text-sm text-[#a0a0b0] bg-[#111118] border border-white/[0.07] rounded-full px-4 py-2
                hover:bg-[#7B5EDB]/10 hover:border-[#7B5EDB]/30 hover:text-[#a78bfa] transition-all"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
