import { Search, BarChart2, Bookmark, GitCompare } from 'lucide-react';

const STEPS = [
  {
    step: '01',
    icon: Search,
    title: 'Ask in plain English',
    desc: 'Type a query like "find high-ROE mid-cap stocks" — no complicated filters needed.',
  },
  {
    step: '02',
    icon: BarChart2,
    title: 'AI parses your intent',
    desc: 'GPT-4o interprets your query into screener criteria and fetches matching stocks.',
  },
  {
    step: '03',
    icon: Bookmark,
    title: 'Deep-dive any stock',
    desc: 'Click any result to see full fundamental analysis, AI pros/cons, and news.',
  },
  {
    step: '04',
    icon: GitCompare,
    title: 'Compare & watchlist',
    desc: 'Compare up to 4 stocks side-by-side and save your favourites to your watchlist.',
  },
];

export function HowItWorks() {
  return (
    <section className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
            How <span className="kf-gradient-text">KairoForge</span> Works
          </h2>
          <p className="text-[#6b6b80] max-w-xl mx-auto">
            From question to insight in seconds
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {STEPS.map(({ step, icon: Icon, title, desc }) => (
            <div key={step} className="kf-card p-6 relative group hover:border-white/[0.15] hover:shadow-kf-glow transition-all duration-300">
              <div className="text-[#7B5EDB]/20 text-5xl font-bold absolute top-4 right-5 font-mono select-none">
                {step}
              </div>
              <div className="bg-[#7B5EDB]/10 rounded-xl p-3 w-fit mb-4">
                <Icon className="w-5 h-5 text-[#7B5EDB]" />
              </div>
              <h3 className="text-white font-semibold mb-2">{title}</h3>
              <p className="text-[#6b6b80] text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
