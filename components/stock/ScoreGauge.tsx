'use client';

import type { StockScore } from '@/lib/scoring';

interface Props {
  score: StockScore;
}

export function ScoreGauge({ score }: Props) {
  const radius = 70;
  const circumference = Math.PI * radius; // half circle
  const progress = (score.total / 100) * circumference;
  const strokeDashoffset = circumference - progress;

  const CATEGORIES = [
    { label: 'Valuation', value: score.valuation, max: 25 },
    { label: 'Profitability', value: score.profitability, max: 25 },
    { label: 'Growth', value: score.growth, max: 25 },
    { label: 'Health', value: score.financial_health, max: 25 },
  ];

  return (
    <div className="kf-card p-6">
      <h3 className="text-sm font-semibold text-[#a78bfa] uppercase tracking-wide mb-4">
        Quality Score
      </h3>

      {/* Gauge */}
      <div className="flex flex-col items-center mb-6">
        <div className="relative">
          <svg width={180} height={100} viewBox="0 0 180 100">
            {/* Track */}
            <path
              d="M 10 90 A 80 80 0 0 1 170 90"
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={14}
              strokeLinecap="round"
            />
            {/* Progress */}
            <path
              d="M 10 90 A 80 80 0 0 1 170 90"
              fill="none"
              stroke={score.color}
              strokeWidth={14}
              strokeLinecap="round"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: 'stroke-dashoffset 1s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-2">
            <span className="text-4xl font-bold text-white">{score.total}</span>
            <span className="text-xs font-semibold" style={{ color: score.color }}>{score.label}</span>
          </div>
        </div>
        <p className="text-xs text-[#6b6b80] text-center mt-2">out of 100 — not financial advice</p>
      </div>

      {/* Breakdown */}
      <div className="space-y-3">
        {CATEGORIES.map(({ label, value, max }) => (
          <div key={label}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-[#6b6b80]">{label}</span>
              <span className="text-white font-medium">{value}/{max}</span>
            </div>
            <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${(value / max) * 100}%`,
                  background: `linear-gradient(90deg, #3D2C8D, #7B5EDB)`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
