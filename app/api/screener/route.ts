import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hasLlmProvider, parseScreenerQuery, rankScreenerCandidates } from '@/lib/openai';

const MAX_FALLBACK_TOKENS = 8;
const FALLBACK_RESULT_LIMIT = 20;
const MAX_LOCAL_PARSE_QUERY_LENGTH = 300;
const MIN_RESULT_LIMIT = 1;
const MAX_RESULT_LIMIT = 50;
const MIN_AI_RESULT_LIMIT = 20;
const MIN_QUERY_LENGTH_FOR_PARTIAL_MATCH = 2;
const LLM_RANK_CANDIDATE_LIMIT = 60;
const BACKFILL_FETCH_MULTIPLIER = 2;
const MAX_DEBT_FREE_THRESHOLD = 0.1;
const RELEVANCE_WEIGHTS = {
  exactSymbol: 120,
  symbolPrefix: 80,
  symbolContains: 50,
  fullNameMatch: 70,
  fullSectorIndustryMatch: 45,
  tokenExactSymbol: 60,
  tokenSymbolPrefix: 30,
  tokenSymbolContains: 20,
  tokenName: 18,
  tokenSector: 16,
  tokenIndustry: 16,
  tokenCapCategory: 10,
} as const;
const VALID_SORT_FIELDS = [
  'marketCap',
  'roe',
  'roce',
  'stockPE',
  'pbRatio',
  'dividendYield',
  'salesGrowth5yr',
  'profitVar5yr',
  'piotroskiScore',
] as const;
const FALLBACK_EXPLANATIONS = {
  noAiKey: 'Using local prompt parser.',
  parseFailed: 'AI parsing failed, using local prompt parser.',
  noStrictMatches: 'No strict matches found, showing closest keyword-based results.',
};

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'above', 'below', 'by', 'for', 'from', 'good',
  'in', 'into', 'is', 'like', 'of', 'on', 'or', 'stocks', 'stock', 'the', 'to', 'top',
  'with', 'without', 'companies', 'company',
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
  } else if (/\bdebt[\s-]*free\b|\bzero debt\b|\bno debt\b/.test(normalized)) {
    filters.maxDebt = MAX_DEBT_FREE_THRESHOLD;
    explanationParts.push(`maxDebt=${MAX_DEBT_FREE_THRESHOLD}`);
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

  const minProfitGrowth5yr = extractNumberFromPattern(boundedQuery, [
    /\bprofit\s*growth\b[^\d%]{0,20}(\d+(?:\.\d+)?)\s*%?/i,
    /(\d+(?:\.\d+)?)\s*%?\s*(?:or\s*more|and\s*above|and\s*higher)?\s*profit\s*growth/i,
  ]);
  if (minProfitGrowth5yr !== undefined) {
    filters.minProfitGrowth5yr = minProfitGrowth5yr;
    explanationParts.push(`minProfitGrowth5yr=${minProfitGrowth5yr}`);
  }

  const minROCE = extractNumberFromPattern(boundedQuery, [
    /\broce\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*%?\s*(?:or\s*more|and\s*above|and\s*higher)?\s*\broce\b/i,
  ]);
  if (minROCE !== undefined) {
    filters.minROCE = minROCE;
    explanationParts.push(`minROCE=${minROCE}`);
  }

  const maxPB = extractNumberFromPattern(boundedQuery, [
    /\b(?:pb|p\/b|price\s*to\s*book)\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
    /(?:below|under|less than|max(?:imum)?)\s*(\d+(?:\.\d+)?)\s*(?:\bpb\b|\bp\/b\b|price\s*to\s*book)/i,
  ]);
  if (maxPB !== undefined && /\b(?:below|under|less|max|<=|<)\b|[<≤]/i.test(normalized)) {
    filters.maxPB = maxPB;
    explanationParts.push(`maxPB=${maxPB}`);
  }

  const minPiotroskiScore = extractNumberFromPattern(boundedQuery, [
    /\bpiotroski(?:\s*score)?\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
  ]);
  if (minPiotroskiScore !== undefined) {
    filters.minPiotroskiScore = minPiotroskiScore;
    explanationParts.push(`minPiotroskiScore=${minPiotroskiScore}`);
  }

  if (/\b(low|lowest|cheap|undervalued)\b.*\b(pe|p\/e)\b|\b(pe|p\/e)\b.*\b(low|lowest|cheap|undervalued)\b/i.test(normalized)) {
    filters.sortBy = 'stockPE';
    filters.sortOrder = 'asc';
  } else if (/\b(high|highest|top|best)\b.*\broe\b|\broe\b.*\b(high|highest|top|best)\b/i.test(normalized)) {
    filters.sortBy = 'roe';
    filters.sortOrder = 'desc';
  } else if (/\b(high|highest|top|best)\b.*\broce\b|\broce\b.*\b(high|highest|top|best)\b/i.test(normalized)) {
    filters.sortBy = 'roce';
    filters.sortOrder = 'desc';
  } else if (/\b(high|highest|top|best)\b.*\bdividend\b|\bdividend\b.*\b(high|highest|top|best)\b/i.test(normalized)) {
    filters.sortBy = 'dividendYield';
    filters.sortOrder = 'desc';
  } else if (/\b(low|lowest|cheap|undervalued)\b.*\b(pb|p\/b)\b|\b(pb|p\/b)\b.*\b(low|lowest|cheap|undervalued)\b/i.test(normalized)) {
    filters.sortBy = 'pbRatio';
    filters.sortOrder = 'asc';
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
      ? `Applied local parsing: ${explanationParts.join(', ')}.`
      : 'Used local keyword interpretation.';

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

  const fallbackRaw = await prisma.stock.findMany({
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

  const results = await maybeRankResultsWithLLM(query, fallbackRaw, FALLBACK_RESULT_LIMIT);

  return NextResponse.json({
    results,
    count: results.length,
    filters: null,
    explanation,
  });
}

type ScreenerResult = {
  symbol: string;
  name: string;
  sector: string;
  marketCapCategory: string;
  currentPrice: number;
  marketCap: number;
  stockPE: number;
  roe: number;
  roce: number;
  debtToEquity: number;
  dividendYield: number;
  salesGrowth5yr: number;
  high52w: number;
  low52w: number;
  promoterHolding: number;
  industry?: string;
  pbRatio?: number;
  profitVar5yr?: number;
  piotroskiScore?: number;
};

async function maybeRankResultsWithLLM(
  query: string,
  candidates: ScreenerResult[],
  limit: number
): Promise<ScreenerResult[]> {
  if (candidates.length === 0) {
    return [];
  }

  const relevanceOrdered = rankResultsByQueryRelevance(query, candidates);

  if (!hasLlmProvider()) {
    return relevanceOrdered.slice(0, limit);
  }

  // Keep token usage and latency bounded while still allowing broad reranking.
  // We cap the candidate pool that gets sent to the LLM and preserve deterministic fallback ordering for the rest.
  try {
    const rankingSymbols = await rankScreenerCandidates(
      query,
      relevanceOrdered.slice(0, LLM_RANK_CANDIDATE_LIMIT).map((candidate) => ({
        symbol: candidate.symbol,
        name: candidate.name,
        sector: candidate.sector,
        industry: candidate.industry,
        marketCapCategory: candidate.marketCapCategory,
        marketCap: candidate.marketCap,
        stockPE: candidate.stockPE,
        pbRatio: candidate.pbRatio,
        roe: candidate.roe,
        roce: candidate.roce,
        debtToEquity: candidate.debtToEquity,
        dividendYield: candidate.dividendYield,
        salesGrowth5yr: candidate.salesGrowth5yr,
        profitVar5yr: candidate.profitVar5yr,
        piotroskiScore: candidate.piotroskiScore,
      })),
      limit
    );

    const bySymbol = new Map(relevanceOrdered.map((candidate) => [candidate.symbol, candidate]));
    const ranked = rankingSymbols
      .map((symbol) => bySymbol.get(symbol))
      .filter((candidate): candidate is ScreenerResult => Boolean(candidate));

    const rankedSymbols = new Set(ranked.map((candidate) => candidate.symbol));
    const remaining = relevanceOrdered.filter((candidate) => !rankedSymbols.has(candidate.symbol));

    return [...ranked, ...remaining].slice(0, limit);
  } catch (error) {
    console.error('LLM ranking failed, returning local relevance order:', error);
    return relevanceOrdered.slice(0, limit);
  }
}

function rankResultsByQueryRelevance(query: string, candidates: ScreenerResult[]): ScreenerResult[] {
  const trimmed = query.trim();
  if (!trimmed) return candidates;

  const queryLower = trimmed.toLowerCase();
  const queryUpper = trimmed.toUpperCase();
  const tokens = extractSearchTokens(trimmed, MAX_FALLBACK_TOKENS);

  const scored = candidates.map((candidate, index) => {
    let score = 0;
    const symbol = candidate.symbol.toUpperCase();
    const name = (candidate.name ?? '').toLowerCase();
    const sector = (candidate.sector ?? '').toLowerCase();
    const industry = (candidate.industry ?? '').toLowerCase();
    const capCategory = (candidate.marketCapCategory ?? '').toLowerCase();

    if (symbol === queryUpper) score += RELEVANCE_WEIGHTS.exactSymbol;
    else if (symbol.startsWith(queryUpper)) score += RELEVANCE_WEIGHTS.symbolPrefix;
    else if (symbol.includes(queryUpper)) score += RELEVANCE_WEIGHTS.symbolContains;

    if (queryLower.length > MIN_QUERY_LENGTH_FOR_PARTIAL_MATCH && name.includes(queryLower)) {
      score += RELEVANCE_WEIGHTS.fullNameMatch;
    }
    if (
      queryLower.length > MIN_QUERY_LENGTH_FOR_PARTIAL_MATCH &&
      (sector.includes(queryLower) || industry.includes(queryLower))
    ) {
      score += RELEVANCE_WEIGHTS.fullSectorIndustryMatch;
    }

    for (const token of tokens) {
      const tokenUpper = token.toUpperCase();
      if (symbol === tokenUpper) score += RELEVANCE_WEIGHTS.tokenExactSymbol;
      else if (symbol.startsWith(tokenUpper)) score += RELEVANCE_WEIGHTS.tokenSymbolPrefix;
      else if (symbol.includes(tokenUpper)) score += RELEVANCE_WEIGHTS.tokenSymbolContains;

      if (name.includes(token)) score += RELEVANCE_WEIGHTS.tokenName;
      if (sector.includes(token)) score += RELEVANCE_WEIGHTS.tokenSector;
      if (industry.includes(token)) score += RELEVANCE_WEIGHTS.tokenIndustry;
      if (capCategory.includes(token)) score += RELEVANCE_WEIGHTS.tokenCapCategory;
    }

    return { candidate, index, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });

  return scored.map((item) => item.candidate);
}

function appendUniqueStocks(
  target: ScreenerResult[],
  incoming: ScreenerResult[],
  seenSymbols: Set<string>,
  maxLength: number
) {
  for (const stock of incoming) {
    if (seenSymbols.has(stock.symbol)) continue;
    seenSymbols.add(stock.symbol);
    target.push(stock);
    if (target.length >= maxLength) break;
  }
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
      if (!hasLlmProvider()) {
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
      minROCE,
      maxPE,
      maxPB,
      maxDebt: maxDebtToEquity,
      minDividendYield,
      minSalesGrowth5yr,
      minProfitGrowth5yr,
      minPiotroskiScore,
      keywords,
      sortBy = 'marketCap',
      sortOrder = 'desc',
      limit = MIN_AI_RESULT_LIMIT,
      explanation,
    } = filters as {
      sector?: string;
      marketCapCategory?: string;
      minROE?: number;
      minROCE?: number;
      maxPE?: number;
      maxPB?: number;
      maxDebt?: number;
      minDividendYield?: number;
      minSalesGrowth5yr?: number;
      minProfitGrowth5yr?: number;
      minPiotroskiScore?: number;
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
      (typeof minROCE === 'number' && minROCE > 0) ||
      (typeof maxPE === 'number' && maxPE > 0) ||
      (typeof maxPB === 'number' && maxPB > 0) ||
      (typeof maxDebtToEquity === 'number' && maxDebtToEquity > 0) ||
      (typeof minDividendYield === 'number' && minDividendYield > 0) ||
      (typeof minSalesGrowth5yr === 'number' && minSalesGrowth5yr > 0) ||
      (typeof minProfitGrowth5yr === 'number' && minProfitGrowth5yr > 0) ||
      (typeof minPiotroskiScore === 'number' && minPiotroskiScore > 0)
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
    if (minROCE && minROCE > 0) where.roce = { gte: minROCE };
    if (maxPE && maxPE > 0) where.stockPE = { lte: maxPE, gt: 0 };
    if (maxPB && maxPB > 0) where.pbRatio = { lte: maxPB, gt: 0 };
    if (maxDebtToEquity && maxDebtToEquity > 0) where.debtToEquity = { lte: maxDebtToEquity };
    if (minDividendYield && minDividendYield > 0) where.dividendYield = { gte: minDividendYield };
    if (minSalesGrowth5yr && minSalesGrowth5yr > 0) where.salesGrowth5yr = { gte: minSalesGrowth5yr };
    if (minProfitGrowth5yr && minProfitGrowth5yr > 0) where.profitVar5yr = { gte: minProfitGrowth5yr };
    if (minPiotroskiScore && minPiotroskiScore > 0) where.piotroskiScore = { gte: minPiotroskiScore };

    const sortAliasMap: Record<string, string> = {
      pe: 'stockPE',
      'p/e': 'stockPE',
      pb: 'pbRatio',
      'p/b': 'pbRatio',
    };
    const normalizedSortBy = sortAliasMap[String(sortBy).toLowerCase()] ?? sortBy;
    const orderByField = VALID_SORT_FIELDS.includes(normalizedSortBy as (typeof VALID_SORT_FIELDS)[number])
      ? normalizedSortBy as string
      : 'marketCap';

    const parsedLimit = Number(limit);
    const requestedLimit = Number.isFinite(parsedLimit)
      ? Math.max(MIN_AI_RESULT_LIMIT, Math.min(MAX_RESULT_LIMIT, Math.round(parsedLimit)))
      : MIN_AI_RESULT_LIMIT;

    const strictResults = await prisma.stock.findMany({
      where,
      orderBy: { [orderByField]: (sortOrder as 'asc' | 'desc') ?? 'desc' },
      take: requestedLimit,
      select: {
        symbol: true,
        name: true,
        sector: true,
        industry: true,
        marketCapCategory: true,
        currentPrice: true,
        marketCap: true,
        stockPE: true,
        pbRatio: true,
        roe: true,
        roce: true,
        debtToEquity: true,
        dividendYield: true,
        salesGrowth5yr: true,
        profitVar5yr: true,
        piotroskiScore: true,
        high52w: true,
        low52w: true,
        promoterHolding: true,
      },
    });

    if (strictResults.length === 0) {
      return runFallbackSearch(query, FALLBACK_EXPLANATIONS.noStrictMatches, keywords ?? []);
    }

    const seenSymbols = new Set(strictResults.map((stock) => stock.symbol));
    let combinedResults = [...strictResults];

    if (combinedResults.length < requestedLimit) {
      const extraTokens = extractSearchTokens(query, MAX_FALLBACK_TOKENS, keywords ?? []);
      const ors = extraTokens.flatMap((token) => [
        { symbol: { contains: token.toUpperCase() } },
        { name: { contains: token } },
        { sector: { contains: token } },
        { industry: { contains: token } },
      ]);

      const remainingSlots = requestedLimit - combinedResults.length;
      const backfillResults = await prisma.stock.findMany({
        where: {
          symbol: { notIn: Array.from(seenSymbols) },
          OR: ors.length > 0 ? ors : undefined,
        },
        orderBy: { marketCap: 'desc' },
        take: Math.max(remainingSlots, remainingSlots * BACKFILL_FETCH_MULTIPLIER),
        select: {
          symbol: true,
          name: true,
          sector: true,
          industry: true,
          marketCapCategory: true,
          currentPrice: true,
          marketCap: true,
          stockPE: true,
          pbRatio: true,
          roe: true,
          roce: true,
          debtToEquity: true,
          dividendYield: true,
          salesGrowth5yr: true,
          profitVar5yr: true,
          piotroskiScore: true,
          high52w: true,
          low52w: true,
          promoterHolding: true,
        },
      });

      appendUniqueStocks(combinedResults, backfillResults, seenSymbols, requestedLimit);
    }

    if (combinedResults.length < requestedLimit) {
      const remainingSlots = requestedLimit - combinedResults.length;
      const marketCapFill = await prisma.stock.findMany({
        where: { symbol: { notIn: Array.from(seenSymbols) } },
        orderBy: { marketCap: 'desc' },
        take: remainingSlots,
        select: {
          symbol: true,
          name: true,
          sector: true,
          industry: true,
          marketCapCategory: true,
          currentPrice: true,
          marketCap: true,
          stockPE: true,
          pbRatio: true,
          roe: true,
          roce: true,
          debtToEquity: true,
          dividendYield: true,
          salesGrowth5yr: true,
          profitVar5yr: true,
          piotroskiScore: true,
          high52w: true,
          low52w: true,
          promoterHolding: true,
        },
      });

      appendUniqueStocks(combinedResults, marketCapFill, seenSymbols, requestedLimit);
    }

    const results = await maybeRankResultsWithLLM(query, combinedResults, requestedLimit);

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
