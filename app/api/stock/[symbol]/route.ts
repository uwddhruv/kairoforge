import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { calculateStockScore } from '@/lib/scoring';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.toUpperCase();

  try {
    const stock = await prisma.stock.findUnique({ where: { symbol } });
    if (!stock) {
      return NextResponse.json({ error: 'Stock not found' }, { status: 404 });
    }

    const score = calculateStockScore(stock);

    return NextResponse.json({ stock, score });
  } catch (err) {
    console.error(`Stock API error for ${symbol}:`, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
