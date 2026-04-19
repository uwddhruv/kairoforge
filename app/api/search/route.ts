import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q')?.trim() ?? '';

  if (query.length < 1) {
    return NextResponse.json({ results: [] });
  }

  try {
    const stocks = await prisma.stock.findMany({
      where: {
        OR: [
          { symbol: { contains: query.toUpperCase() } },
          { name: { contains: query } },
        ],
      },
      select: {
        symbol: true,
        name: true,
        sector: true,
        marketCapCategory: true,
        currentPrice: true,
        stockPE: true,
        roe: true,
        marketCap: true,
      },
      take: 10,
      orderBy: { marketCap: 'desc' },
    });

    return NextResponse.json({ results: stocks });
  } catch (err) {
    console.error('Search error:', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
