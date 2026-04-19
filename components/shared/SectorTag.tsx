const SECTOR_COLORS: Record<string, string> = {
  IT: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Banking: 'bg-green-500/10 text-green-400 border-green-500/20',
  FMCG: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  Pharma: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  Auto: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  Energy: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  Metals: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  Realty: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Telecom: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  Infra: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
};

const DEFAULT_COLOR = 'bg-purple-500/10 text-purple-400 border-purple-500/20';

interface Props {
  sector: string;
}

export function SectorTag({ sector }: Props) {
  const color = Object.entries(SECTOR_COLORS).find(([key]) =>
    sector.toLowerCase().includes(key.toLowerCase())
  )?.[1] ?? DEFAULT_COLOR;

  return (
    <span className={`border rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {sector}
    </span>
  );
}
