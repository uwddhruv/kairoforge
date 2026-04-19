import { HeroSection } from '@/components/home/HeroSection';
import { HowItWorks } from '@/components/home/HowItWorks';
import { SampleQueries } from '@/components/home/SampleQueries';
import { StatsBar } from '@/components/home/StatsBar';
import { SectorGrid } from '@/components/home/SectorGrid';
import { MarketMood } from '@/components/home/MarketMood';
import { StockOfDayWidget } from '@/components/home/StockOfDay';

export default function HomePage() {
  return (
    <div className="flex flex-col">
      <HeroSection />
      <StatsBar />
      <MarketMood />
      <SampleQueries />
      <StockOfDayWidget />
      <SectorGrid />
      <HowItWorks />
    </div>
  );
}
