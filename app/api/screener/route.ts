import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hasLlmProvider, parseScreenerQuery, rankScreenerCandidates } from '@/lib/openai';

const MAX_FALLBACK_TOKENS = 8;
const DEFAULT_RESULT_LIMIT = 1000;
const FALLBACK_RESULT_LIMIT = DEFAULT_RESULT_LIMIT;
const MAX_LOCAL_PARSE_QUERY_LENGTH = 300;
const MIN_RESULT_LIMIT = 1;
const MAX_RESULT_LIMIT = 1500;
// Avoid very short substring matches that can make relevance ranking noisy.
const MIN_QUERY_LENGTH_FOR_PARTIAL_MATCH = 2;
const MIN_SEARCH_TOKEN_LENGTH = 3;
const MAX_KEYWORD_TOKENS = 10;
const LLM_RANK_CANDIDATE_LIMIT = 60;
const BACKFILL_FETCH_MULTIPLIER = 2;
const MAX_DEBT_FREE_THRESHOLD = 0.1;
const TARGET_UNIVERSE_SIZE = 1000;
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
  'currentPrice',
  'intrinsicValue',
  'grahamNumber',
  'roe',
  'roce',
  'stockPE',
  'eps',
  'pegRatio',
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
  'with', 'without', 'companies', 'company', 'show', 'find', 'list', 'give', 'want',
  'need', 'looking', 'whose', 'that', 'which', 'than', 'between', 'under', 'over',
  'best', 'better', 'highest', 'lowest', 'more', 'less', 'near', 'around', 'based',
]);

const NUMERIC_FILTER_KEYS = [
  'minMarketCap', 'maxMarketCap', 'minCurrentPrice', 'maxCurrentPrice', 'minBookValue',
  'maxBookValue', 'minIntrinsicValue', 'maxIntrinsicValue', 'minGrahamNumber',
  'maxGrahamNumber', 'minPE', 'maxPE', 'minROE', 'minROCE', 'minDebt', 'maxDebt', 'maxPB',
  'minDividendYield', 'minSalesGrowth5yr', 'minProfitGrowth5yr', 'minPiotroskiScore',
  'minCurrentRatio', 'minQuickRatio', 'maxPEG', 'maxEVEbitda', 'minPromoterHolding',
  'minFiiHolding', 'minDiiHolding', 'minEPS', 'maxNetDebt', 'minFreeCashFlow3yr',
  'minHigh52w', 'maxLow52w', 'limit',
] as const;
type NumericFilterKey = (typeof NUMERIC_FILTER_KEYS)[number];
const ZERO_ALLOWED_NUMERIC_KEYS = new Set<NumericFilterKey>(['minDebt', 'maxDebt', 'maxNetDebt']);

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

function hasPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function buildRangeFilter(min?: number, max?: number, positiveOnly = false): Record<string, number> | null {
  const filter: Record<string, number> = {};
  if (hasPositiveNumber(min)) filter.gte = min;
  if (hasPositiveNumber(max)) filter.lte = max;
  if (positiveOnly && filter.gte === undefined && filter.lte !== undefined) {
    filter.gt = 0;
  }
  return Object.keys(filter).length > 0 ? filter : null;
}

function toPositiveFiniteNumber(value: unknown, allowZero = false): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && (allowZero ? value >= 0 : value > 0)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && (allowZero ? parsed >= 0 : parsed > 0)) return parsed;
  }
  return undefined;
}

function normalizeBooleanTrue(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function hasPositiveMeaningfulFilterValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.some((item) => {
      if (item === null || item === undefined) return false;
      if (typeof item === 'string') return item.trim().length > 0;
      if (typeof item === 'number') return Number.isFinite(item) && item > 0;
      if (typeof item === 'boolean') return item;
      return true;
    });
  }
  return true;
}

function mergeParsedFilters(
  localFilters: Record<string, unknown>,
  aiFilters: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...localFilters };

  for (const [key, value] of Object.entries(aiFilters)) {
    if (
      typeof value === 'number' &&
      value === 0 &&
      ZERO_ALLOWED_NUMERIC_KEYS.has(key as NumericFilterKey)
    ) {
      merged[key] = value;
      continue;
    }

    if (key === 'keywords') {
      const localKeywords = Array.isArray(merged.keywords) ? merged.keywords : [];
      const aiKeywords = Array.isArray(value) ? value : [];
      const mergedKeywords = [...localKeywords, ...aiKeywords]
        .map((item) => String(item).trim())
        .filter((item) => item.length > 0);
      if (mergedKeywords.length > 0) {
        merged.keywords = Array.from(new Set(mergedKeywords));
      }
      continue;
    }

    if (!hasPositiveMeaningfulFilterValue(value)) continue;
    merged[key] = value;
  }

  return merged;
}

function swapIfRangeInverted(
  filters: Record<string, unknown>,
  minKey: string,
  maxKey: string
): Record<string, unknown> {
  const nextFilters = { ...filters };
  const minValue = filters[minKey];
  const maxValue = filters[maxKey];
  if (typeof minValue === 'number' && typeof maxValue === 'number' && minValue > maxValue) {
    nextFilters[minKey] = maxValue;
    nextFilters[maxKey] = minValue;
  }
  return nextFilters;
}

function normalizeParsedFilters(rawFilters: Record<string, unknown>, query: string): Record<string, unknown> {
  let normalized: Record<string, unknown> = {};

  const sector = normalizeText(rawFilters.sector);
  if (sector) normalized.sector = sector;

  const marketCapCategory = normalizeText(rawFilters.marketCapCategory);
  if (marketCapCategory) normalized.marketCapCategory = marketCapCategory;

  for (const key of NUMERIC_FILTER_KEYS) {
    const parsed = toPositiveFiniteNumber(rawFilters[key], ZERO_ALLOWED_NUMERIC_KEYS.has(key));
    if (parsed === undefined) continue;

    if (key === 'limit') {
      normalized.limit = Math.max(MIN_RESULT_LIMIT, Math.min(MAX_RESULT_LIMIT, Math.round(parsed)));
      continue;
    }

    normalized[key] = parsed;
  }

  const sortBy = normalizeText(rawFilters.sortBy);
  if (sortBy) normalized.sortBy = sortBy;

  const sortOrderRaw = normalizeText(rawFilters.sortOrder)?.toLowerCase();
  if (sortOrderRaw === 'asc' || sortOrderRaw === 'desc') {
    normalized.sortOrder = sortOrderRaw;
  }

  if (normalizeBooleanTrue(rawFilters.priceBelowGraham)) {
    normalized.priceBelowGraham = true;
  }
  if (normalizeBooleanTrue(rawFilters.priceBelowIntrinsic)) {
    normalized.priceBelowIntrinsic = true;
  }

  const explanation = normalizeText(rawFilters.explanation);
  if (explanation) normalized.explanation = explanation;

  const parsedKeywords = Array.isArray(rawFilters.keywords)
    ? rawFilters.keywords.map((value) => String(value))
    : [];
  const normalizedKeywords = extractSearchTokens(query, MAX_KEYWORD_TOKENS, parsedKeywords);
  if (normalizedKeywords.length > 0) {
    normalized.keywords = normalizedKeywords;
  }

  normalized = swapIfRangeInverted(normalized, 'minMarketCap', 'maxMarketCap');
  normalized = swapIfRangeInverted(normalized, 'minCurrentPrice', 'maxCurrentPrice');
  normalized = swapIfRangeInverted(normalized, 'minBookValue', 'maxBookValue');
  normalized = swapIfRangeInverted(normalized, 'minIntrinsicValue', 'maxIntrinsicValue');
  normalized = swapIfRangeInverted(normalized, 'minGrahamNumber', 'maxGrahamNumber');
  normalized = swapIfRangeInverted(normalized, 'minDebt', 'maxDebt');
  return normalized;
}

function isPriceBelowGraham(stock: Pick<ScreenerResult, 'currentPrice' | 'grahamNumber'>): boolean {
  return (
    typeof stock.grahamNumber === 'number' &&
    stock.grahamNumber > 0 &&
    stock.currentPrice > 0 &&
    stock.currentPrice < stock.grahamNumber
  );
}

function isPriceBelowIntrinsic(stock: Pick<ScreenerResult, 'currentPrice' | 'intrinsicValue'>): boolean {
  return (
    typeof stock.intrinsicValue === 'number' &&
    stock.intrinsicValue > 0 &&
    stock.currentPrice > 0 &&
    stock.currentPrice < stock.intrinsicValue
  );
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

  const minMarketCap = extractNumberFromPattern(boundedQuery, [
    /\bmarket\s*cap\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
    /(?:above|over|greater than|more than|min(?:imum)?)\s*(\d+(?:\.\d+)?)\s*(?:cr|crore|crores)?\s*(?:market\s*cap|mcap)?/i,
  ]);
  if (minMarketCap !== undefined && /\b(?:above|over|greater|min|>=|>)\b|[>≥]/i.test(normalized)) {
    filters.minMarketCap = minMarketCap;
    explanationParts.push(`minMarketCap=${minMarketCap}`);
  }

  const maxMarketCap = extractNumberFromPattern(boundedQuery, [
    /\bmarket\s*cap\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
    /(?:below|under|less than|max(?:imum)?)\s*(\d+(?:\.\d+)?)\s*(?:cr|crore|crores)?\s*(?:market\s*cap|mcap)?/i,
  ]);
  if (maxMarketCap !== undefined && /\b(?:below|under|less|max|<=|<)\b|[<≤]/i.test(normalized)) {
    filters.maxMarketCap = maxMarketCap;
    explanationParts.push(`maxMarketCap=${maxMarketCap}`);
  }

  const minCurrentPrice = extractNumberFromPattern(boundedQuery, [
    /\b(?:price|cmp|current\s*price)\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
    /(?:above|over|greater than|more than|min(?:imum)?)\s*(\d+(?:\.\d+)?)\s*(?:price|cmp|current\s*price)/i,
  ]);
  if (minCurrentPrice !== undefined && /\b(?:above|over|greater|min|>=|>)\b|[>≥]/i.test(normalized)) {
    filters.minCurrentPrice = minCurrentPrice;
    explanationParts.push(`minCurrentPrice=${minCurrentPrice}`);
  }

  const maxCurrentPrice = extractNumberFromPattern(boundedQuery, [
    /\b(?:price|cmp|current\s*price)\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
    /(?:below|under|less than|lower than|max(?:imum)?)\s*(\d+(?:\.\d+)?)\s*(?:price|cmp|current\s*price)/i,
  ]);
  if (maxCurrentPrice !== undefined && /\b(?:below|under|less|lower|max|<=|<)\b|[<≤]/i.test(normalized)) {
    filters.maxCurrentPrice = maxCurrentPrice;
    explanationParts.push(`maxCurrentPrice=${maxCurrentPrice}`);
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
  const minDebt = extractNumberFromPattern(boundedQuery, [
    /\b(?:debt(?:\s*to\s*equity)?|d\/e)\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
    /(?:above|over|greater than|more than|min(?:imum)?)\s*(\d+(?:\.\d+)?)\s*(?:debt|debt\s*to\s*equity|d\/e)/i,
  ]);
  if (minDebt !== undefined && /\b(?:above|over|greater|min|>=|>)\b|[>≥]/i.test(normalized)) {
    filters.minDebt = minDebt;
    explanationParts.push(`minDebt=${minDebt}`);
  }
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

  const minCurrentRatio = extractNumberFromPattern(boundedQuery, [
    /\bcurrent\s*ratio\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*(?:or\s*more|and\s*above|and\s*higher)?\s*current\s*ratio/i,
  ]);
  if (minCurrentRatio !== undefined) {
    filters.minCurrentRatio = minCurrentRatio;
    explanationParts.push(`minCurrentRatio=${minCurrentRatio}`);
  }

  const minQuickRatio = extractNumberFromPattern(boundedQuery, [
    /\bquick\s*ratio\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*(?:or\s*more|and\s*above|and\s*higher)?\s*quick\s*ratio/i,
  ]);
  if (minQuickRatio !== undefined) {
    filters.minQuickRatio = minQuickRatio;
    explanationParts.push(`minQuickRatio=${minQuickRatio}`);
  }

  const maxPEG = extractNumberFromPattern(boundedQuery, [
    /\bpeg(?:\s*ratio)?\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
    /(?:below|under|less than|max(?:imum)?)\s*(\d+(?:\.\d+)?)\s*peg(?:\s*ratio)?/i,
  ]);
  if (maxPEG !== undefined && /\b(?:below|under|less|max|<=|<)\b|[<≤]/i.test(normalized)) {
    filters.maxPEG = maxPEG;
    explanationParts.push(`maxPEG=${maxPEG}`);
  }

  const maxEVEbitda = extractNumberFromPattern(boundedQuery, [
    /\bev(?:\/|\s*)ebitda\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
    /(?:below|under|less than|max(?:imum)?)\s*(\d+(?:\.\d+)?)\s*ev(?:\/|\s*)ebitda/i,
  ]);
  if (maxEVEbitda !== undefined && /\b(?:below|under|less|max|<=|<)\b|[<≤]/i.test(normalized)) {
    filters.maxEVEbitda = maxEVEbitda;
    explanationParts.push(`maxEVEbitda=${maxEVEbitda}`);
  }

  const minPromoterHolding = extractNumberFromPattern(boundedQuery, [
    /\bpromoter(?:\s*holding)?\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
  ]);
  if (minPromoterHolding !== undefined) {
    filters.minPromoterHolding = minPromoterHolding;
    explanationParts.push(`minPromoterHolding=${minPromoterHolding}`);
  }

  const minFiiHolding = extractNumberFromPattern(boundedQuery, [
    /\bfii(?:\s*holding)?\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
  ]);
  if (minFiiHolding !== undefined) {
    filters.minFiiHolding = minFiiHolding;
    explanationParts.push(`minFiiHolding=${minFiiHolding}`);
  }

  const minDiiHolding = extractNumberFromPattern(boundedQuery, [
    /\bdii(?:\s*holding)?\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
  ]);
  if (minDiiHolding !== undefined) {
    filters.minDiiHolding = minDiiHolding;
    explanationParts.push(`minDiiHolding=${minDiiHolding}`);
  }

  const minEPS = extractNumberFromPattern(boundedQuery, [
    /\beps\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*(?:or\s*more|and\s*above|and\s*higher)?\s*eps/i,
  ]);
  if (minEPS !== undefined) {
    filters.minEPS = minEPS;
    explanationParts.push(`minEPS=${minEPS}`);
  }

  const maxNetDebt = extractNumberFromPattern(boundedQuery, [
    /\bnet\s*debt\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
    /(?:below|under|less than|max(?:imum)?)\s*(\d+(?:\.\d+)?)\s*net\s*debt/i,
  ]);
  if (maxNetDebt !== undefined && /\b(?:below|under|less|max|<=|<)\b|[<≤]/i.test(normalized)) {
    filters.maxNetDebt = maxNetDebt;
    explanationParts.push(`maxNetDebt=${maxNetDebt}`);
  }

  const minFreeCashFlow3yr = extractNumberFromPattern(boundedQuery, [
    /\bfree\s*cash\s*flow(?:\s*3\s*yr|\s*3yr)?\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
  ]);
  if (minFreeCashFlow3yr !== undefined) {
    filters.minFreeCashFlow3yr = minFreeCashFlow3yr;
    explanationParts.push(`minFreeCashFlow3yr=${minFreeCashFlow3yr}`);
  }

  const minBookValue = extractNumberFromPattern(boundedQuery, [
    /\bbook\s*value\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
    /(?:above|over|greater than|more than|min(?:imum)?)\s*(\d+(?:\.\d+)?)\s*book\s*value/i,
  ]);
  if (minBookValue !== undefined && /\b(?:above|over|greater|min|>=|>)\b|[>≥]/i.test(normalized)) {
    filters.minBookValue = minBookValue;
    explanationParts.push(`minBookValue=${minBookValue}`);
  }

  const maxBookValue = extractNumberFromPattern(boundedQuery, [
    /\bbook\s*value\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
    /(?:below|under|less than|max(?:imum)?)\s*(\d+(?:\.\d+)?)\s*book\s*value/i,
  ]);
  if (maxBookValue !== undefined && /\b(?:below|under|less|max|<=|<)\b|[<≤]/i.test(normalized)) {
    filters.maxBookValue = maxBookValue;
    explanationParts.push(`maxBookValue=${maxBookValue}`);
  }

  const minIntrinsicValue = extractNumberFromPattern(boundedQuery, [
    /\bintrinsic(?:\s*value)?\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
    /(?:above|over|greater than|more than|min(?:imum)?)\s*(\d+(?:\.\d+)?)\s*intrinsic(?:\s*value)?/i,
  ]);
  if (minIntrinsicValue !== undefined && /\b(?:above|over|greater|min|>=|>)\b|[>≥]/i.test(normalized)) {
    filters.minIntrinsicValue = minIntrinsicValue;
    explanationParts.push(`minIntrinsicValue=${minIntrinsicValue}`);
  }

  const maxIntrinsicValue = extractNumberFromPattern(boundedQuery, [
    /\bintrinsic(?:\s*value)?\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
    /(?:below|under|less than|max(?:imum)?)\s*(\d+(?:\.\d+)?)\s*intrinsic(?:\s*value)?/i,
  ]);
  if (maxIntrinsicValue !== undefined && /\b(?:below|under|less|max|<=|<)\b|[<≤]/i.test(normalized)) {
    filters.maxIntrinsicValue = maxIntrinsicValue;
    explanationParts.push(`maxIntrinsicValue=${maxIntrinsicValue}`);
  }

  const minGrahamNumber = extractNumberFromPattern(boundedQuery, [
    /\bgraham(?:\s*number)?\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
    /(?:above|over|greater than|more than|min(?:imum)?)\s*(\d+(?:\.\d+)?)\s*graham(?:\s*number)?/i,
  ]);
  if (minGrahamNumber !== undefined && /\b(?:above|over|greater|min|>=|>)\b|[>≥]/i.test(normalized)) {
    filters.minGrahamNumber = minGrahamNumber;
    explanationParts.push(`minGrahamNumber=${minGrahamNumber}`);
  }

  const maxGrahamNumber = extractNumberFromPattern(boundedQuery, [
    /\bgraham(?:\s*number)?\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
    /(?:below|under|less than|max(?:imum)?)\s*(\d+(?:\.\d+)?)\s*graham(?:\s*number)?/i,
  ]);
  if (maxGrahamNumber !== undefined && /\b(?:below|under|less|max|<=|<)\b|[<≤]/i.test(normalized)) {
    filters.maxGrahamNumber = maxGrahamNumber;
    explanationParts.push(`maxGrahamNumber=${maxGrahamNumber}`);
  }

  const minHigh52w = extractNumberFromPattern(boundedQuery, [
    /\b52\s*w(?:eek)?\s*high\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
  ]);
  if (minHigh52w !== undefined) {
    filters.minHigh52w = minHigh52w;
    explanationParts.push(`minHigh52w=${minHigh52w}`);
  }

  const maxLow52w = extractNumberFromPattern(boundedQuery, [
    /\b52\s*w(?:eek)?\s*low\b[^\d]{0,20}(\d+(?:\.\d+)?)/i,
  ]);
  if (maxLow52w !== undefined) {
    filters.maxLow52w = maxLow52w;
    explanationParts.push(`maxLow52w=${maxLow52w}`);
  }

  const priceTerms = String.raw`\b(?:price|cmp|current\s*price)\b`;
  const lowerThanTerms = String.raw`(?:below|under|less than|lower than|<)`;
  const higherThanTerms = String.raw`(?:above|greater than|higher than|>)`;
  const grahamTerms = String.raw`\bgraham(?:\s*number)?\b`;
  const priceBelowGrahamRegex = new RegExp(
    `${priceTerms}.*${lowerThanTerms}.*?${grahamTerms}|${grahamTerms}.*${higherThanTerms}\\s*${priceTerms}`,
    'i'
  );
  const intrinsicTerms = String.raw`\bintrinsic(?:\s*value)?\b`;
  const priceBelowIntrinsicRegex = new RegExp(
    `${priceTerms}.*${lowerThanTerms}.*?${intrinsicTerms}|${intrinsicTerms}.*${higherThanTerms}\\s*${priceTerms}`,
    'i'
  );

  if (priceBelowGrahamRegex.test(normalized)) {
    filters.priceBelowGraham = true;
    explanationParts.push('priceBelowGraham=true');
  }
  if (priceBelowIntrinsicRegex.test(normalized)) {
    filters.priceBelowIntrinsic = true;
    explanationParts.push('priceBelowIntrinsic=true');
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

  const limit = extractNumberFromPattern(boundedQuery, [/\b(?:top|best|show|list)\s+(\d{1,4})\b/i]);
  if (limit !== undefined) {
    filters.limit = Math.max(MIN_RESULT_LIMIT, Math.min(MAX_RESULT_LIMIT, Math.trunc(limit)));
  }

  filters.explanation =
    explanationParts.length > 0
      ? `Applied local parsing: ${explanationParts.join(', ')}.`
      : 'Used local keyword interpretation.';

  return filters;
}

async function runFallbackSearch(
  query: string,
  explanation: string,
  extraTokens: string[] = [],
  universeCount?: number
) {
  const trimmed = query.trim();
  if (!trimmed) {
    return NextResponse.json({ results: [], count: 0, explanation, universeCount });
  }

  const tokens = extractSearchTokens(trimmed, MAX_FALLBACK_TOKENS, extraTokens);
  if (tokens.length === 0) {
    return NextResponse.json({ results: [], count: 0, filters: null, explanation, universeCount });
  }

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
    universeCount,
  });
}

type ScreenerResult = {
  symbol: string;
  name: string;
  sector: string;
  marketCapCategory: string;
  currentPrice: number;
  marketCap: number;
  bookValue?: number;
  intrinsicValue?: number;
  grahamNumber?: number;
  stockPE: number;
  roe: number;
  roce: number;
  debtToEquity: number;
  dividendYield: number;
  salesGrowth5yr: number;
  currentRatio?: number;
  quickRatio?: number;
  pegRatio?: number;
  eps?: number;
  freeCashFlow3yr?: number;
  netDebt?: number;
  high52w: number;
  low52w: number;
  promoterHolding: number;
  fiiHolding?: number;
  diiHolding?: number;
  evEbitda?: number;
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
    .split(/[^A-Za-z0-9&]+/)
    .reduce<string[]>((tokens, token) => {
      const original = token.trim();
      if (!original) return tokens;

      const normalized = original.toLowerCase();
      if (STOP_WORDS.has(normalized)) return tokens;
      if (normalized.length >= MIN_SEARCH_TOKEN_LENGTH || /^[A-Z0-9]{2,5}$/.test(original)) {
        tokens.push(normalized);
      }
      return tokens;
    }, []);

  const cleanedExtraTokens = extraTokens
    .map((token) => String(token).toLowerCase().trim())
    .filter((token) => token.length >= MIN_SEARCH_TOKEN_LENGTH && !STOP_WORDS.has(token));

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
      take: Math.min(limit, MAX_RESULT_LIMIT),
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

    const universeCount = await prisma.stock.count();
    const universeWarning =
      universeCount < TARGET_UNIVERSE_SIZE
        ? `Universe currently has ${universeCount} stocks. Run db:setup in an environment with NSE access to expand toward ${TARGET_UNIVERSE_SIZE}+ symbols.`
        : null;

    // Parse query with AI, or local fallback parser
    const localFilters = parseScreenerQueryLocally(query);
    let filters: Record<string, unknown> = localFilters;
    let parseFallbackExplanation: string | null = null;
    try {
      if (!hasLlmProvider()) {
        parseFallbackExplanation = FALLBACK_EXPLANATIONS.noAiKey;
      } else {
        const aiFilters = await parseScreenerQuery(query);
        filters = mergeParsedFilters(localFilters, aiFilters);
      }
    } catch (parseError) {
      console.error('Screener parse fallback:', parseError);
      parseFallbackExplanation = FALLBACK_EXPLANATIONS.parseFailed;
      filters = localFilters;
    }
    filters = normalizeParsedFilters(filters, query);

    const {
      sector,
      marketCapCategory,
      minMarketCap,
      maxMarketCap,
      minCurrentPrice,
      maxCurrentPrice,
      minBookValue,
      maxBookValue,
      minIntrinsicValue,
      maxIntrinsicValue,
      minGrahamNumber,
      maxGrahamNumber,
      minPE,
      minROE,
      minROCE,
      minDebt,
      maxPE,
      maxPB,
      maxDebt: maxDebtToEquity,
      minDividendYield,
      minSalesGrowth5yr,
      minProfitGrowth5yr,
      minPiotroskiScore,
      minCurrentRatio,
      minQuickRatio,
      maxPEG,
      maxEVEbitda,
      minPromoterHolding,
      minFiiHolding,
      minDiiHolding,
      minEPS,
      maxNetDebt,
      minFreeCashFlow3yr,
      minHigh52w,
      maxLow52w,
      priceBelowGraham,
      priceBelowIntrinsic,
      keywords,
      sortBy = 'marketCap',
      sortOrder = 'desc',
      limit = DEFAULT_RESULT_LIMIT,
      explanation,
    } = filters as {
      sector?: string;
      marketCapCategory?: string;
      minMarketCap?: number;
      maxMarketCap?: number;
      minCurrentPrice?: number;
      maxCurrentPrice?: number;
      minBookValue?: number;
      maxBookValue?: number;
      minIntrinsicValue?: number;
      maxIntrinsicValue?: number;
      minGrahamNumber?: number;
      maxGrahamNumber?: number;
      minPE?: number;
      minROE?: number;
      minROCE?: number;
      minDebt?: number;
      maxPE?: number;
      maxPB?: number;
      maxDebt?: number;
      minDividendYield?: number;
      minSalesGrowth5yr?: number;
      minProfitGrowth5yr?: number;
      minPiotroskiScore?: number;
      minCurrentRatio?: number;
      minQuickRatio?: number;
      maxPEG?: number;
      maxEVEbitda?: number;
      minPromoterHolding?: number;
      minFiiHolding?: number;
      minDiiHolding?: number;
      minEPS?: number;
      maxNetDebt?: number;
      minFreeCashFlow3yr?: number;
      minHigh52w?: number;
      maxLow52w?: number;
      priceBelowGraham?: boolean;
      priceBelowIntrinsic?: boolean;
      keywords?: string[];
      sortBy?: string;
      sortOrder?: string;
      limit?: number;
      explanation?: string;
    };

    const hasStructuredFilters = Boolean(
      sector ||
      marketCapCategory ||
      hasPositiveNumber(minMarketCap) ||
      hasPositiveNumber(maxMarketCap) ||
      hasPositiveNumber(minCurrentPrice) ||
      hasPositiveNumber(maxCurrentPrice) ||
      hasPositiveNumber(minBookValue) ||
      hasPositiveNumber(maxBookValue) ||
      hasPositiveNumber(minIntrinsicValue) ||
      hasPositiveNumber(maxIntrinsicValue) ||
      hasPositiveNumber(minGrahamNumber) ||
      hasPositiveNumber(maxGrahamNumber) ||
      hasPositiveNumber(minPE) ||
      (typeof minROE === 'number' && minROE > 0) ||
      (typeof minROCE === 'number' && minROCE > 0) ||
      hasPositiveNumber(minDebt) ||
      (typeof maxPE === 'number' && maxPE > 0) ||
      (typeof maxPB === 'number' && maxPB > 0) ||
      (typeof maxDebtToEquity === 'number' && maxDebtToEquity >= 0) ||
      (typeof minDividendYield === 'number' && minDividendYield > 0) ||
      (typeof minSalesGrowth5yr === 'number' && minSalesGrowth5yr > 0) ||
      (typeof minProfitGrowth5yr === 'number' && minProfitGrowth5yr > 0) ||
      (typeof minPiotroskiScore === 'number' && minPiotroskiScore > 0) ||
      hasPositiveNumber(minCurrentRatio) ||
      hasPositiveNumber(minQuickRatio) ||
      hasPositiveNumber(maxPEG) ||
      hasPositiveNumber(maxEVEbitda) ||
      hasPositiveNumber(minPromoterHolding) ||
      hasPositiveNumber(minFiiHolding) ||
      hasPositiveNumber(minDiiHolding) ||
      hasPositiveNumber(minEPS) ||
      (typeof maxNetDebt === 'number' && maxNetDebt >= 0) ||
      hasPositiveNumber(minFreeCashFlow3yr) ||
      hasPositiveNumber(minHigh52w) ||
      hasPositiveNumber(maxLow52w) ||
      priceBelowGraham === true ||
      priceBelowIntrinsic === true
    );

    if (!hasStructuredFilters) {
      return runFallbackSearch(
        query,
        [parseFallbackExplanation ?? FALLBACK_EXPLANATIONS.noStrictMatches, universeWarning]
          .filter(Boolean)
          .join(' '),
        keywords ?? [],
        universeCount
      );
    }

    const where: Record<string, unknown> = {};
    if (sector) where.sector = { contains: sector };
    if (marketCapCategory) where.marketCapCategory = marketCapCategory;
    const marketCapFilter = buildRangeFilter(minMarketCap, maxMarketCap);
    if (marketCapFilter) where.marketCap = marketCapFilter;
    const currentPriceFilter = buildRangeFilter(minCurrentPrice, maxCurrentPrice, true);
    if (currentPriceFilter) where.currentPrice = currentPriceFilter;
    const bookValueFilter = buildRangeFilter(minBookValue, maxBookValue, true);
    if (bookValueFilter) where.bookValue = bookValueFilter;
    const intrinsicValueFilter = buildRangeFilter(minIntrinsicValue, maxIntrinsicValue, true);
    if (intrinsicValueFilter) where.intrinsicValue = intrinsicValueFilter;
    const grahamNumberFilter = buildRangeFilter(minGrahamNumber, maxGrahamNumber, true);
    if (grahamNumberFilter) where.grahamNumber = grahamNumberFilter;
    const peFilter = buildRangeFilter(minPE, maxPE, true);
    if (peFilter) where.stockPE = peFilter;
    if (minROE && minROE > 0) where.roe = { gte: minROE };
    if (minROCE && minROCE > 0) where.roce = { gte: minROCE };
    if (maxPB && maxPB > 0) where.pbRatio = { lte: maxPB, gt: 0 };
    const debtFilter: Record<string, number> = {};
    if (typeof minDebt === 'number' && Number.isFinite(minDebt) && minDebt >= 0) {
      debtFilter.gte = minDebt;
    }
    if (typeof maxDebtToEquity === 'number' && Number.isFinite(maxDebtToEquity) && maxDebtToEquity >= 0) {
      debtFilter.lte = maxDebtToEquity;
    }
    if (Object.keys(debtFilter).length > 0) where.debtToEquity = debtFilter;
    if (minDividendYield && minDividendYield > 0) where.dividendYield = { gte: minDividendYield };
    if (minSalesGrowth5yr && minSalesGrowth5yr > 0) where.salesGrowth5yr = { gte: minSalesGrowth5yr };
    if (minProfitGrowth5yr && minProfitGrowth5yr > 0) where.profitVar5yr = { gte: minProfitGrowth5yr };
    if (minPiotroskiScore && minPiotroskiScore > 0) where.piotroskiScore = { gte: minPiotroskiScore };
    if (minCurrentRatio && minCurrentRatio > 0) where.currentRatio = { gte: minCurrentRatio };
    if (minQuickRatio && minQuickRatio > 0) where.quickRatio = { gte: minQuickRatio };
    if (maxPEG && maxPEG > 0) where.pegRatio = { lte: maxPEG, gt: 0 };
    if (maxEVEbitda && maxEVEbitda > 0) where.evEbitda = { lte: maxEVEbitda, gt: 0 };
    if (minPromoterHolding && minPromoterHolding > 0) where.promoterHolding = { gte: minPromoterHolding };
    if (minFiiHolding && minFiiHolding > 0) where.fiiHolding = { gte: minFiiHolding };
    if (minDiiHolding && minDiiHolding > 0) where.diiHolding = { gte: minDiiHolding };
    if (minEPS && minEPS > 0) where.eps = { gte: minEPS };
    if (maxNetDebt && maxNetDebt > 0) where.netDebt = { lte: maxNetDebt };
    if (minFreeCashFlow3yr && minFreeCashFlow3yr > 0) where.freeCashFlow3yr = { gte: minFreeCashFlow3yr };
    if (minHigh52w && minHigh52w > 0) where.high52w = { gte: minHigh52w };
    if (maxLow52w && maxLow52w > 0) where.low52w = { lte: maxLow52w };

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
      ? Math.max(MIN_RESULT_LIMIT, Math.min(MAX_RESULT_LIMIT, Math.round(parsedLimit)))
      : DEFAULT_RESULT_LIMIT;

    const strictTake = (priceBelowGraham || priceBelowIntrinsic)
      // Relative filters like currentPrice < grahamNumber are applied in-memory, so fetch a wider slice first.
      ? Math.min(MAX_RESULT_LIMIT, Math.max(requestedLimit, requestedLimit * BACKFILL_FETCH_MULTIPLIER))
      : requestedLimit;

    const strictResults = await prisma.stock.findMany({
      where,
      orderBy: { [orderByField]: (sortOrder as 'asc' | 'desc') ?? 'desc' },
      take: strictTake,
      select: {
        symbol: true,
        name: true,
        sector: true,
        industry: true,
        marketCapCategory: true,
        currentPrice: true,
        marketCap: true,
        bookValue: true,
        intrinsicValue: true,
        grahamNumber: true,
        stockPE: true,
        pbRatio: true,
        roe: true,
        roce: true,
        debtToEquity: true,
        dividendYield: true,
        salesGrowth5yr: true,
        profitVar5yr: true,
        piotroskiScore: true,
        currentRatio: true,
        quickRatio: true,
        pegRatio: true,
        evEbitda: true,
        fiiHolding: true,
        diiHolding: true,
        eps: true,
        netDebt: true,
        freeCashFlow3yr: true,
        high52w: true,
        low52w: true,
        promoterHolding: true,
      },
    });

    const strictFiltered = strictResults.filter((stock) => {
      if (priceBelowGraham === true && !isPriceBelowGraham(stock)) return false;
      if (priceBelowIntrinsic === true && !isPriceBelowIntrinsic(stock)) return false;
      return true;
    });

    if (strictFiltered.length === 0) {
      return runFallbackSearch(
        query,
        [FALLBACK_EXPLANATIONS.noStrictMatches, universeWarning].filter(Boolean).join(' '),
        keywords ?? [],
        universeCount
      );
    }

    const seenSymbols = new Set(strictFiltered.map((stock) => stock.symbol));
    let combinedResults = [...strictFiltered];

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
          bookValue: true,
          intrinsicValue: true,
          grahamNumber: true,
          stockPE: true,
          pbRatio: true,
          roe: true,
          roce: true,
          debtToEquity: true,
          dividendYield: true,
          salesGrowth5yr: true,
          profitVar5yr: true,
          piotroskiScore: true,
          currentRatio: true,
          quickRatio: true,
          pegRatio: true,
          evEbitda: true,
          fiiHolding: true,
          diiHolding: true,
          eps: true,
          netDebt: true,
          freeCashFlow3yr: true,
          high52w: true,
          low52w: true,
          promoterHolding: true,
        },
      });

      const filteredBackfill = backfillResults.filter((stock) => {
        if (priceBelowGraham === true && !isPriceBelowGraham(stock)) return false;
        if (priceBelowIntrinsic === true && !isPriceBelowIntrinsic(stock)) return false;
        return true;
      });
      appendUniqueStocks(combinedResults, filteredBackfill, seenSymbols, requestedLimit);
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
          bookValue: true,
          intrinsicValue: true,
          grahamNumber: true,
          stockPE: true,
          pbRatio: true,
          roe: true,
          roce: true,
          debtToEquity: true,
          dividendYield: true,
          salesGrowth5yr: true,
          profitVar5yr: true,
          piotroskiScore: true,
          currentRatio: true,
          quickRatio: true,
          pegRatio: true,
          evEbitda: true,
          fiiHolding: true,
          diiHolding: true,
          eps: true,
          netDebt: true,
          freeCashFlow3yr: true,
          high52w: true,
          low52w: true,
          promoterHolding: true,
        },
      });

      const filteredMarketCapFill = marketCapFill.filter((stock) => {
        if (priceBelowGraham === true && !isPriceBelowGraham(stock)) return false;
        if (priceBelowIntrinsic === true && !isPriceBelowIntrinsic(stock)) return false;
        return true;
      });
      appendUniqueStocks(combinedResults, filteredMarketCapFill, seenSymbols, requestedLimit);
    }

    const results = await maybeRankResultsWithLLM(query, combinedResults, requestedLimit);

    return NextResponse.json({
      results,
      count: results.length,
      filters,
      explanation: [explanation ?? parseFallbackExplanation, universeWarning].filter(Boolean).join(' '),
      universeCount,
    });
  } catch (err) {
    console.error('AI Screener POST error:', err);
    return NextResponse.json({ error: 'AI screening failed' }, { status: 500 });
  }
}
