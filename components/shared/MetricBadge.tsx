interface Props {
  label: string;
  value: string | number;
  variant?: 'default' | 'good' | 'warn' | 'bad' | 'neutral';
}

const VARIANTS = {
  default: 'bg-white/[0.05] text-[#e0e0f0] border border-white/[0.08]',
  good: 'bg-green-500/10 text-green-400 border border-green-500/20',
  warn: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
  bad: 'bg-red-500/10 text-red-400 border border-red-500/20',
  neutral: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
};

export function MetricBadge({ label, value, variant = 'default' }: Props) {
  return (
    <div className={`rounded-xl px-3 py-2 text-center ${VARIANTS[variant]}`}>
      <div className="text-xs opacity-70 mb-0.5">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
