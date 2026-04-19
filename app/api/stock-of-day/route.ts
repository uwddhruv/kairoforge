import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateStockOfDay } from '@/lib/openai';

function getTodayIST(): string {
  return new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
}

export async function GET() {
  try {
    const today = getTodayIST();

    // Check if we already have today's stock of day
    const existing = await prisma.stockOfDay.findUnique({ where: { date: today } });
    if (existing) {
      const stock = await prisma.stock.findUnique({ where: { symbol: existing.symbol } });
      return NextResponse.json({ symbol: existing.symbol, analysis: existing.analysis, stock });
    }

    // Pick a featured stock (good fundamentals, large/mid cap)
    const candidates = await prisma.stock.findMany({
      where: {
        marketCapCategory: { in: ['Large Cap', 'Mid Cap'] },
        roe: { gte: 15 },
        roce: { gte: 15 },
        stockPE: { gt: 0, lte: 40 },
      },
      orderBy: { marketCap: 'desc' },
      take: 10,
    });

    if (candidates.length === 0) {
      return NextResponse.json({ symbol: null, analysis: null, stock: null });
    }

    // Rotate by day-of-year
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    const selected = candidates[dayOfYear % candidates.length];

    let analysis = '';
    if (process.env.OPENAI_API_KEY) {
      analysis = await generateStockOfDay(selected.symbol, {
        name: selected.name,
        sector: selected.sector,
        currentPrice: selected.currentPrice,
        marketCap: selected.marketCap,
        stockPE: selected.stockPE,
        roe: selected.roe,
        roce: selected.roce,
        debtToEquity: selected.debtToEquity,
        salesGrowth5yr: selected.salesGrowth5yr,
        dividendYield: selected.dividendYield,
      });
    } else {
      analysis = `${selected.name} (${selected.symbol}) — A ${selected.marketCapCategory} company in the ${selected.sector} sector with ROE of ${selected.roe.toFixed(1)}% and ROCE of ${selected.roce.toFixed(1)}%.\n\n⚠️ Not financial advice. Investing involves risk.`;
    }

    // Save to DB
    await prisma.stockOfDay.create({
      data: { symbol: selected.symbol, date: today, analysis },
    });

    return NextResponse.json({ symbol: selected.symbol, analysis, stock: selected });
  } catch (err) {
    console.error('Stock of day error:', err);
    return NextResponse.json({ symbol: null, analysis: null, stock: null }, { status: 200 });
  }
}
