import Link from 'next/link';
import { Sparkles, Github, Mail, ExternalLink } from 'lucide-react';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-white/[0.06] bg-[#0A0A0F] mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <img
                src="https://github.com/user-attachments/assets/66cc4d53-bb18-443b-9f93-a08de797968a"
                alt="KairoForge logo"
                className="w-7 h-7 rounded-lg object-cover"
              />
              <div className="flex flex-col leading-none">
                <span className="font-bold text-white">KairoForge</span>
                <span className="text-[#6b6b80] text-[9px] font-medium tracking-widest uppercase leading-tight">
                  Equity Intelligence Terminal
                </span>
              </div>
            </div>
            <p className="text-[#6b6b80] text-sm leading-relaxed max-w-sm">
              AI-powered fundamental analysis for Indian stocks. Research smarter, not harder.
            </p>
            <p className="text-xs text-[#6b6b80]/60 mt-4">
              ⚠️ Not financial advice. All data is for informational purposes only.
              Always consult a SEBI-registered investment advisor.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-white text-sm font-semibold mb-3">Features</h4>
            <ul className="space-y-2 text-sm text-[#6b6b80]">
              <li><Link href="/discover" className="hover:text-[#a78bfa] transition-colors">AI Discover</Link></li>
              <li><Link href="/screener" className="hover:text-[#a78bfa] transition-colors">Screener</Link></li>
              <li><Link href="/compare" className="hover:text-[#a78bfa] transition-colors">Compare</Link></li>
              <li><Link href="/watchlist" className="hover:text-[#a78bfa] transition-colors">Watchlist</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-white text-sm font-semibold mb-3">Contact</h4>
            <ul className="space-y-2 text-sm text-[#6b6b80]">
              <li>
                <a
                  href={`mailto:${process.env.NEXT_PUBLIC_CREATOR_EMAIL ?? 'uwddhruv@gmail.com'}`}
                  className="flex items-center gap-1.5 hover:text-[#a78bfa] transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" />
                  {process.env.NEXT_PUBLIC_CREATOR_EMAIL ?? 'uwddhruv@gmail.com'}
                </a>
              </li>
              <li>
                <a
                  href="https://nseindia.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 hover:text-[#a78bfa] transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  NSE India
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/[0.06] pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#6b6b80]">
          <span>© {currentYear} KairoForge. All rights reserved.</span>
          <span>Data sourced from NSE & Screener.in. Not affiliated with any exchange.</span>
        </div>
      </div>
    </footer>
  );
}
