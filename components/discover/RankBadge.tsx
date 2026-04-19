interface Props {
  rank: number;
}

export function RankBadge({ rank }: Props) {
  const colors: Record<number, string> = {
    1: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    2: 'bg-gray-400/20 text-gray-300 border-gray-400/30',
    3: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  };
  const cls = colors[rank] ?? 'bg-white/5 text-[#6b6b80] border-white/10';

  return (
    <span className={`border rounded-lg w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0 ${cls}`}>
      {rank}
    </span>
  );
}
