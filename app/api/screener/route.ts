import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { parseScreenerQuery } from '@/lib/openai';

const MAX_FALLBACK_TOKENS = 8;
const FALLBACK_RESULT_LIMIT = 20;
const MAX_LOCAL_PARSE_QUERY_LENGTH = 300;
const MIN_RESULT_LIMIT = 1;
const MAX_RESULT_LIMIT = 50;
const FALLBACK_EXPLANATIONS = {
  noAiKey: 'AI parser unavailable, using local prompt parsing.',
  parseFailed: 'AI parser temporarily unavailable, using local prompt parsing.',
  noStrictMatches: 'No strict AI matches found, showing closest keyword-based results.',
};

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'above', 'below', 'by', 'for', 'from', 'good',
  'in', 'into', 'is', 'like', 'of', 'on', 'or', 'stocks', 'stock', 'the', 'to', 'top',
  'with', 'without',
]);

const SECTOR_MATCHERS: Array<{ sector: string; keywords: string[] }> = [
  { sector: 'IT', keywords: ['it', 'software', 'tech', 'technology'] },
  { sector: 'Banking', keywords: ['bank', 'banking', 'financial', 'finance'] },
  { sector: 'FMCG', keywords: ['fmcg', 'consumer staples', 'consumer goods'] },
  { sector: 'Pharma', keywords: ['pharma', 'pharmaceutical', 'healthcare'] },
  { sector: 'Auto', keywords: ['auto', 'automobile'] },
  { sector: 'Metals', keywords: ['metal', 'metals', 'mining'] },
  { sector: 'Energy', keywords: ['energy', 'power', 'oil', 'gas'] },
  { sector: 'Infra', keywords: ['infra', 'infrastructure', 'construction'] },
  { sector: 'Realty', keywords: ['realty', 'real estate'] },
  { sector: 'Telecom', keywords: ['telecom', 'telecommunications'] },
];

function extractNumberFromPattern(query: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (!match) continue;
    for (let idx = match.length - 1; idx >= 1; idx -= 1) {
      const raw = match[idx];
      if (!raw) continue;
      const parsed = parseFloat(raw.replace(/,/g, ''));
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return undefined;
}

function parseScreenerQueryLocally(query: string): Record<string, unknown> {
  const boundedQuery = query.slice(0, MAX_LOCAL_PARSE_QUERY_LENGTH);
  const normalized = boundedQuery.toLowerCase();
  const filters: Record<string, unknown> = {
    keywords: extractSearchTokens(boundedQuery, 6),
  };
  const explanationParts: string[] = [];

  const sectorMatch = SECTOR_MATCHERS.find(({ keywords }) =>
    keywords.some((keyword) => normalized.includes(keyword))
  );
  if (sectorMatch) {
    filters.sector = sectorMatch.sector;
    explanationParts.push(`sector=${sectorMatch.sector}`);
  }

  if (/\blarge\s*cap\b|\bbluechip\b/.test(normalized)) {
    filters.marketCapCategory = 'Large Cap';
    explanationParts.push('marketCapCategory=Large Cap');
  } else if (/\bmid\s*cap\b/.test(normalized)) {
    filters.marketCapCategory = 'Mid Cap';
    explanationParts.push('marketCapCategory=Mid Cap');
  } else if (/\bsmall\s*cap\b/.test(normalized)) {
    filters.marketCapCategory = 'Small Cap';
    explanationParts.push('marketCapCategory=Small Cap');
  }

  const minROE = extractNumberFromPattern(boundedQuery, [
    /\broe\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*%?\s*(?:or\s*more|and\s*above|and\s*higher)?\s*\broe\b/i,
  ]);
  if (minROE !== undefined) {
    filters.minROE = minROE;
    explanationParts.push(`minROE=${minROE}`);
  }

  const maxPE = extractNumberFromPattern(boundedQuery, [
    /\b(?:pe|p\/e)\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
    /(?:below|under|less than|max(?:imum)?)\s*(\d+(?:\.\d+)?)\s*(?:\bpe\b|\bp\/e\b)/i,
  ]);
  if (maxPE !== undefined && /\b(?:below|under|less|max|<=|<)\b|[<≤]/i.test(normalized)) {
    filters.maxPE = maxPE;
    explanationParts.push(`maxPE=${maxPE}`);
  }

  const maxDebt = extractNumberFromPattern(boundedQuery, [
    /\b(?:debt(?:\s*to\s*equity)?|d\/e)\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
    /(?:below|under|less than|max(?:imum)?)\s*(\d+(?:\.\d+)?)\s*(?:debt|debt\s*to\s*equity|d\/e)/i,
  ]);
  if (maxDebt !== undefined && /\b(?:below|under|less|max|<=|<)\b|[<≤]/i.test(normalized)) {
    filters.maxDebt = maxDebt;
    explanationParts.push(`maxDebt=${maxDebt}`);
  }

  const minDividendYield = extractNumberFromPattern(boundedQuery, [
    /\bdividend(?:\s*yield)?\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*%?\s*(?:or\s*more|and\s*above|and\s*higher)?\s*dividend(?:\s*yield)?/i,
  ]);
  if (minDividendYield !== undefined) {
    filters.minDividendYield = minDividendYield;
    explanationParts.push(`minDividendYield=${minDividendYield}`);
  }

  const minSalesGrowth5yr = extractNumberFromPattern(boundedQuery, [
    /\bsales\s*growth\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*%?\s*(?:or\s*more|and\s*above|and\s*higher)?\s*sales\s*growth/i,
  ]);
  if (minSalesGrowth5yr !== undefined) {
    filters.minSalesGrowth5yr = minSalesGrowth5yr;
    explanationParts.push(`minSalesGrowth5yr=${minSalesGrowth5yr}`);
  }

  if (/\b(low|lowest|cheap|undervalued)\b.*\b(pe|p\/e)\b|\b(pe|p\/e)\b.*\b(low|lowest|cheap|undervalued)\b/i.test(normalized)) {
    filters.sortBy = 'stockPE';
    filters.sortOrder = 'asc';
  } else if (/\b(high|highest|top|best)\b.*\broe\b|\broe\b.*\b(high|highest|top|best)\b/i.test(normalized)) {
    filters.sortBy = 'roe';
    filters.sortOrder = 'desc';
  } else if (/\b(high|highest|top|best)\b.*\bdividend\b|\bdividend\b.*\b(high|highest|top|best)\b/i.test(normalized)) {
    filters.sortBy = 'dividendYield';
    filters.sortOrder = 'desc';
  } else if (/\b(high|highest|top|best|strong)\b.*\bsales\s*growth\b|\bsales\s*growth\b.*\b(high|highest|top|best|strong)\b/i.test(normalized)) {
    filters.sortBy = 'salesGrowth5yr';
    filters.sortOrder = 'desc';
  } else {
    filters.sortBy = 'marketCap';
    filters.sortOrder = 'desc';
  }

  const limit = extractNumberFromPattern(boundedQuery, [/\b(?:top|best|show|list)\s+(\d{1,3})\b/i]);
  if (limit !== undefined) {
    filters.limit = Math.max(MIN_RESULT_LIMIT, Math.min(MAX_RESULT_LIMIT, Math.trunc(limit)));
  }

  filters.explanation =
    explanationParts.length > 0
      ? `AI parser unavailable. Applied local parsing: ${explanationParts.join(', ')}.`
      : 'AI parser unavailable. Used local keyword interpretation.';

  return filters;
}

async function runFallbackSearch(query: string, explanation: string, extraTokens: string[] = []) {
  const trimmed = query.trim();
  if (!trimmed) {
    return NextResponse.json({ results: [], count: 0, explanation });
  }

  const tokens = extractSearchTokens(trimmed, MAX_FALLBACK_TOKENS, extraTokens);
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

function extractSearchTokens(query: string, maxTokens: number, extraTokens: string[] = []): string[] {
  const cleanedQueryTokens = query
    .toLowerCase()
    .split(/[^a-z0-9&]+/)
    .map((token) => token.trim())
    .filter((token) => token && token.length > 1 && !STOP_WORDS.has(token));

  const cleanedExtraTokens = extraTokens
    .map((token) => String(token).toLowerCase().trim())
    .filter((token) => token && token.length > 1 && !STOP_WORDS.has(token));

  const merged = Array.from(new Set([...cleanedExtraTokens, ...cleanedQueryTokens]));
  const extraTokenSet = new Set(cleanedExtraTokens);

  return merged
    .sort((a, b) => {
      if (b.length !== a.length) return b.length - a.length;
      return Number(extraTokenSet.has(b)) - Number(extraTokenSet.has(a));
    })
    .slice(0, maxTokens);
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

    // Parse query with AI, or local fallback parser
    let filters: Record<string, unknown>;
    let parseFallbackExplanation: string | null = null;
    try {
      if (!process.env.OPENAI_API_KEY) {
        parseFallbackExplanation = FALLBACK_EXPLANATIONS.noAiKey;
        filters = parseScreenerQueryLocally(query);
      } else {
        filters = await parseScreenerQuery(query);
      }
    } catch (parseError) {
      console.error('Screener parse fallback:', parseError);
      parseFallbackExplanation = FALLBACK_EXPLANATIONS.parseFailed;
      filters = parseScreenerQueryLocally(query);
    }

    const {
      sector,
      marketCapCategory,
      minROE,
      maxPE,
      maxDebt: maxDebtToEquity,
      minDividendYield,
      minSalesGrowth5yr,
      keywords,
      sortBy = 'marketCap',
      sortOrder = 'desc',
      limit = 20,
      explanation,
    } = filters as {
      sector?: string;
      marketCapCategory?: string;
      minROE?: number;
      maxPE?: number;
      maxDebt?: number;
      minDividendYield?: number;
      minSalesGrowth5yr?: number;
      keywords?: string[];
      sortBy?: string;
      sortOrder?: string;
      limit?: number;
      explanation?: string;
    };

    const hasStructuredFilters = Boolean(
      sector ||
      marketCapCategory ||
      (typeof minROE === 'number' && minROE > 0) ||
      (typeof maxPE === 'number' && maxPE > 0) ||
      (typeof maxDebtToEquity === 'number' && maxDebtToEquity > 0) ||
      (typeof minDividendYield === 'number' && minDividendYield > 0) ||
      (typeof minSalesGrowth5yr === 'number' && minSalesGrowth5yr > 0)
    );

    if (!hasStructuredFilters) {
      return runFallbackSearch(
        query,
        parseFallbackExplanation ?? FALLBACK_EXPLANATIONS.noStrictMatches,
        keywords ?? []
      );
    }

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
      return runFallbackSearch(query, FALLBACK_EXPLANATIONS.noStrictMatches, keywords ?? []);
    }

    return NextResponse.json({
      results,
      count: results.length,
      filters,
      explanation: explanation ?? parseFallbackExplanation,
    });
  } catch (err) {
    console.error('AI Screener POST error:', err);
    return NextResponse.json({ error: 'AI screening failed' }, { status: 500 });
  }
}
