import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { compareStocks } from '@/lib/openai';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbols, includeAI = false } = body as { symbols: string[]; includeAI?: boolean };

    if (!Array.isArray(symbols) || symbols.length < 2 || symbols.length > 4) {
      return NextResponse.json({ error: 'Provide 2-4 symbols' }, { status: 400 });
    }

    const upperSymbols = symbols.map((s: string) => s.toUpperCase());

    const stocks = await prisma.stock.findMany({
      where: { symbol: { in: upperSymbols } },
    });

    if (stocks.length < 2) {
      return NextResponse.json({ error: 'Could not find enough stocks' }, { status: 404 });
    }

    // Preserve requested order
    const orderedStocks = upperSymbols
      .map(sym => stocks.find(s => s.symbol === sym))
      .filter(Boolean);

    let aiAnalysis = '';
    if (includeAI && process.env.OPENAI_API_KEY) {
      const stocksData = orderedStocks.map(s => ({
        symbol: s!.symbol,
        name: s!.name,
        stockPE: s!.stockPE,
        pbRatio: s!.pbRatio,
        roe: s!.roe,
        roce: s!.roce,
        debtToEquity: s!.debtToEquity,
        salesGrowth5yr: s!.salesGrowth5yr,
        profitVar5yr: s!.profitVar5yr,
        dividendYield: s!.dividendYield,
        marketCap: s!.marketCap,
      }));
      aiAnalysis = await compareStocks(upperSymbols, stocksData);
    }

    return NextResponse.json({ stocks: orderedStocks, aiAnalysis });
  } catch (err) {
    console.error('Compare API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
