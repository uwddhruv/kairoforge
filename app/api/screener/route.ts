import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { parseScreenerQuery } from '@/lib/openai';

const MAX_FALLBACK_TOKENS = 5;
const FALLBACK_RESULT_LIMIT = 20;

async function runFallbackSearch(query: string, explanation: string) {
  const trimmed = query.trim();
  if (!trimmed) {
    return NextResponse.json({ results: [], count: 0, explanation });
  }

  const tokens = Array.from(new Set(trimmed.split(/\s+/).filter(Boolean))).slice(0, MAX_FALLBACK_TOKENS);
  const ors = tokens.flatMap((token) => [
    { symbol: { contains: token.toUpperCase() } },
    { name: { contains: token } },
    { sector: { contains: token } },
    { industry: { contains: token } },
  ]);

  const results = await prisma.stock.findMany({
    where: ors.length > 0 ? { OR: ors } : undefined,
    orderBy: { marketCap: 'desc' },
    take: FALLBACK_RESULT_LIMIT,
    select: {
      symbol: true,
      name: true,
      sector: true,
      marketCapCategory: true,
      currentPrice: true,
      marketCap: true,
      stockPE: true,
      roe: true,
      roce: true,
      debtToEquity: true,
      dividendYield: true,
      salesGrowth5yr: true,
      high52w: true,
      low52w: true,
      promoterHolding: true,
    },
  });

  return NextResponse.json({
    results,
    count: results.length,
    filters: null,
    explanation,
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const sector = searchParams.get('sector') ?? '';
  const marketCapCategory = searchParams.get('marketCapCategory') ?? '';
  const minROE = parseFloat(searchParams.get('minROE') ?? '0') || 0;
  const maxPE = parseFloat(searchParams.get('maxPE') ?? '0') || 0;
  const maxDebt = parseFloat(searchParams.get('maxDebt') ?? '0') || 0;
  const minDividendYield = parseFloat(searchParams.get('minDividendYield') ?? '0') || 0;
  const minSalesGrowth5yr = parseFloat(searchParams.get('minSalesGrowth5yr') ?? '0') || 0;
  const sortBy = searchParams.get('sortBy') ?? 'marketCap';
  const sortOrder = (searchParams.get('sortOrder') ?? 'desc') as 'asc' | 'desc';
  const limit = parseInt(searchParams.get('limit') ?? '50') || 50;

  try {
    const where: Record<string, unknown> = {};
    if (sector) where.sector = { contains: sector };
    if (marketCapCategory) where.marketCapCategory = marketCapCategory;
    if (minROE > 0) where.roe = { gte: minROE };
    if (maxPE > 0) where.stockPE = { ...(where.stockPE as Record<string, unknown> ?? {}), lte: maxPE, gt: 0 };
    if (maxDebt > 0) where.debtToEquity = { lte: maxDebt };
    if (minDividendYield > 0) where.dividendYield = { gte: minDividendYield };
    if (minSalesGrowth5yr > 0) where.salesGrowth5yr = { gte: minSalesGrowth5yr };

    const validSortFields = ['marketCap', 'roe', 'roce', 'stockPE', 'dividendYield', 'salesGrowth5yr', 'currentPrice'];
    const orderByField = validSortFields.includes(sortBy) ? sortBy : 'marketCap';

    const results = await prisma.stock.findMany({
      where,
      orderBy: { [orderByField]: sortOrder },
      take: Math.min(limit, 100),
      select: {
        symbol: true,
        name: true,
        sector: true,
        marketCapCategory: true,
        currentPrice: true,
        marketCap: true,
        stockPE: true,
        roe: true,
        roce: true,
        debtToEquity: true,
        dividendYield: true,
        salesGrowth5yr: true,
        high52w: true,
        low52w: true,
        promoterHolding: true,
      },
    });

    return NextResponse.json({ results, count: results.length });
  } catch (err) {
    console.error('Screener GET error:', err);
    return NextResponse.json({ error: 'Screener failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json() as { query: string };
    if (!query?.trim()) {
      return NextResponse.json({ error: 'Query required' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return runFallbackSearch(query, 'Showing keyword-based results (AI parser unavailable).');
    }

    // Parse query with AI
    let filters: Record<string, unknown>;
    try {
      filters = await parseScreenerQuery(query);
    } catch (parseError) {
      console.error('Screener parse fallback:', parseError);
      return runFallbackSearch(query, 'Showing keyword-based results (AI parser temporarily unavailable).');
    }

    const {
      sector,
      marketCapCategory,
      minROE,
      maxPE,
      maxDebt: maxDebtToEquity,
      minDividendYield,
      minSalesGrowth5yr,
      sortBy = 'marketCap',
      sortOrder = 'desc',
      limit = 20,
    } = filters as {
      sector?: string;
      marketCapCategory?: string;
      minROE?: number;
      maxPE?: number;
      maxDebt?: number;
      minDividendYield?: number;
      minSalesGrowth5yr?: number;
      sortBy?: string;
      sortOrder?: string;
      limit?: number;
      explanation?: string;
    };

    const where: Record<string, unknown> = {};
    if (sector) where.sector = { contains: sector };
    if (marketCapCategory) where.marketCapCategory = marketCapCategory;
    if (minROE && minROE > 0) where.roe = { gte: minROE };
    if (maxPE && maxPE > 0) where.stockPE = { lte: maxPE, gt: 0 };
    if (maxDebtToEquity && maxDebtToEquity > 0) where.debtToEquity = { lte: maxDebtToEquity };
    if (minDividendYield && minDividendYield > 0) where.dividendYield = { gte: minDividendYield };
    if (minSalesGrowth5yr && minSalesGrowth5yr > 0) where.salesGrowth5yr = { gte: minSalesGrowth5yr };

    const validSortFields = ['marketCap', 'roe', 'roce', 'stockPE', 'dividendYield', 'salesGrowth5yr'];
    const orderByField = validSortFields.includes(sortBy as string) ? sortBy as string : 'marketCap';

    const results = await prisma.stock.findMany({
      where,
      orderBy: { [orderByField]: (sortOrder as 'asc' | 'desc') ?? 'desc' },
      take: Math.min((limit as number) ?? 20, 50),
      select: {
        symbol: true,
        name: true,
        sector: true,
        marketCapCategory: true,
        currentPrice: true,
        marketCap: true,
        stockPE: true,
        roe: true,
        roce: true,
        debtToEquity: true,
        dividendYield: true,
        salesGrowth5yr: true,
        high52w: true,
        low52w: true,
        promoterHolding: true,
      },
    });

    if (results.length === 0) {
      return runFallbackSearch(query, 'No strict AI matches found, showing closest keyword-based results.');
    }

    return NextResponse.json({ results, count: results.length, filters, explanation: (filters as { explanation?: string }).explanation });
  } catch (err) {
    console.error('AI Screener POST error:', err);
    return NextResponse.json({ error: 'AI screening failed' }, { status: 500 });
  }
}
