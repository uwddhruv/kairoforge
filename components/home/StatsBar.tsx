const STATS = [
  { value: '1,000+', label: 'NSE/BSE Stocks' },
  { value: '40+', label: 'Financial Metrics' },
  { value: 'GPT-4o', label: 'AI Engine' },
  { value: 'Real-time', label: 'Market Data' },
];

export function StatsBar() {
  return (
    <section className="border-y border-white/[0.05] bg-[#0D0D14] py-6 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {STATS.map(({ value, label }) => (
            <div key={label}>
              <div className="text-2xl font-bold text-white mb-0.5">{value}</div>
              <div className="text-xs text-[#6b6b80]">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
