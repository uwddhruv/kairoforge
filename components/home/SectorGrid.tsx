'use client';

import { useRouter } from 'next/navigation';

const SECTORS = [
  { name: 'IT', icon: '💻', q: 'top IT stocks' },
  { name: 'Banking', icon: '🏦', q: 'top banking stocks' },
  { name: 'FMCG', icon: '🛒', q: 'top FMCG stocks' },
  { name: 'Pharma', icon: '💊', q: 'top pharma stocks' },
  { name: 'Auto', icon: '🚗', q: 'top auto stocks' },
  { name: 'Energy', icon: '⚡', q: 'top energy stocks' },
  { name: 'Metals', icon: '⚙️', q: 'top metals stocks' },
  { name: 'Realty', icon: '🏠', q: 'top realty stocks' },
  { name: 'Telecom', icon: '📡', q: 'top telecom stocks' },
  { name: 'Infra', icon: '🏗️', q: 'top infrastructure stocks' },
];

export function SectorGrid() {
  const router = useRouter();

  return (
    <section className="py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-white mb-2">
            Browse by <span className="kf-gradient-text">Sector</span>
          </h2>
          <p className="text-[#6b6b80]">Explore fundamentals across Indian market sectors</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {SECTORS.map(({ name, icon, q }) => (
            <button
              key={name}
              onClick={() => router.push(`/discover?q=${encodeURIComponent(q)}`)}
              className="kf-card-hover p-5 flex flex-col items-center gap-2 cursor-pointer"
            >
              <span className="text-3xl">{icon}</span>
              <span className="text-sm font-medium text-[#e0e0f0]">{name}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
