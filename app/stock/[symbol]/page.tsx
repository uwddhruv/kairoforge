import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { MetricsPanel } from '@/components/stock/MetricsPanel';
import { ScoreGauge } from '@/components/stock/ScoreGauge';
import { ProsConsPanel } from '@/components/stock/ProsConsPanel';
import { NewsPanel } from '@/components/stock/NewsPanel';
import { calculateStockScore } from '@/lib/scoring';
import { formatCurrency, formatMarketCap } from '@/lib/utils';
import type { Metadata } from 'next';
import { TrendingUp, Building2, Tag } from 'lucide-react';

interface Props {
  params: Promise<{ symbol: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol: rawSymbol } = await params;
  const stock = await prisma.stock.findUnique({ where: { symbol: rawSymbol.toUpperCase() } });
  if (!stock) return { title: 'Stock Not Found' };
  return {
    title: `${stock.symbol} — ${stock.name}`,
    description: `Fundamental analysis of ${stock.name} (${stock.symbol}). PE: ${stock.stockPE}, ROE: ${stock.roe}%, Market Cap: ${formatMarketCap(stock.marketCap)}.`,
  };
}

export default async function StockPage({ params }: Props) {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.toUpperCase();
  const stock = await prisma.stock.findUnique({ where: { symbol } });

  if (!stock) notFound();

  const score = calculateStockScore(stock);

  return (
    <div className="min-h-screen pt-20 pb-16 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Stock Header */}
        <div className="kf-card p-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-[#7B5EDB]/15 rounded-xl p-3">
                  <TrendingUp className="w-6 h-6 text-[#7B5EDB]" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-white">{stock.symbol}</h1>
                  <p className="text-[#6b6b80] text-sm">{stock.exchange}</p>
                </div>
              </div>
              <h2 className="text-xl text-[#e0e0f0] font-medium mb-3">{stock.name}</h2>
              <div className="flex flex-wrap gap-2">
                {stock.sector && (
                  <span className="kf-badge-purple flex items-center gap-1">
                    <Building2 className="w-3 h-3" />{stock.sector}
                  </span>
                )}
                {stock.industry && (
                  <span className="kf-badge-purple flex items-center gap-1">
                    <Tag className="w-3 h-3" />{stock.industry}
                  </span>
                )}
                <span className="kf-badge-yellow">{stock.marketCapCategory}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl md:text-4xl font-bold text-white mb-1">
                {formatCurrency(stock.currentPrice)}
              </div>
              <div className="text-sm text-[#6b6b80]">
                52W: {formatCurrency(stock.low52w)} — {formatCurrency(stock.high52w)}
              </div>
              <div className="text-sm text-[#6b6b80] mt-1">
                MCap: {formatMarketCap(stock.marketCap)}
              </div>
            </div>
          </div>
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Score + Pros/Cons */}
          <div className="space-y-6">
            <ScoreGauge score={score} />
            <ProsConsPanel symbol={symbol} stockData={stock} />
          </div>

          {/* Right: Metrics */}
          <div className="lg:col-span-2">
            <MetricsPanel stock={stock} />
          </div>
        </div>

        {/* News */}
        <NewsPanel symbol={symbol} companyName={stock.name} />

        {/* Disclaimer */}
        <p className="text-center text-xs text-[#6b6b80] py-4">
          ⚠️ All data is for informational purposes only. Not financial advice. Investing involves risk.
          Always consult a SEBI-registered investment advisor before making investment decisions.
        </p>
      </div>
    </div>
  );
}
