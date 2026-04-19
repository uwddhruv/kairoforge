'use client';

export function LoadingOrb() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-6">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-2 border-[#7B5EDB]/20 animate-pulse" />
        <div className="absolute inset-2 rounded-full border-2 border-[#7B5EDB]/40 animate-spin border-t-[#7B5EDB]" />
        <div className="absolute inset-4 rounded-full bg-[#7B5EDB]/10 animate-pulse" />
      </div>
      <div className="text-[#6b6b80] text-sm animate-pulse">Analysing with AI...</div>
    </div>
  );
}
