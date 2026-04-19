import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import axios from 'axios';

const NEWS_TTL_MS = 30 * 60 * 1000; // 30 minutes

async function fetchGNewsHeadlines(symbol: string, companyName: string) {
  // Use a public RSS/news aggregation to get headlines
  // This uses GNews API if key available, otherwise falls back to placeholder
  try {
    const query = encodeURIComponent(`${companyName} ${symbol} NSE`);
    const response = await axios.get(
      `https://gnews.io/api/v4/search?q=${query}&lang=en&country=in&max=6&token=${process.env.GNEWS_API_KEY ?? ''}`,
      { timeout: 5000 }
    );
    return response.data.articles ?? [];
  } catch {
    return [];
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { symbol: string } }
) {
  const symbol = params.symbol.toUpperCase();

  try {
    // Check cache
    const cached = await prisma.newsCache.findUnique({ where: { symbol } });
    if (cached && Date.now() - cached.cachedAt.getTime() < NEWS_TTL_MS) {
      return NextResponse.json({ articles: JSON.parse(cached.data), cached: true });
    }

    const stock = await prisma.stock.findUnique({
      where: { symbol },
      select: { name: true, symbol: true },
    });

    const articles = stock ? await fetchGNewsHeadlines(symbol, stock.name) : [];

    // Cache the result
    if (articles.length > 0) {
      await prisma.newsCache.upsert({
        where: { symbol },
        update: { data: JSON.stringify(articles), cachedAt: new Date() },
        create: { symbol, data: JSON.stringify(articles) },
      });
    }

    return NextResponse.json({ articles, cached: false });
  } catch (err) {
    console.error(`News API error for ${symbol}:`, err);
    return NextResponse.json({ articles: [], error: 'Failed to fetch news' }, { status: 200 });
  }
}
