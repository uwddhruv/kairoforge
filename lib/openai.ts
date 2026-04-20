import OpenAI from 'openai';

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? 'placeholder',
    });
  }
  return _openai;
}

const SYSTEM_PROMPT = `You are an Indian stock market analyst assistant for KairoForge. 
Be factual, data-driven, and concise. 
Do not provide buy/sell recommendations. 
Always include a risk disclaimer. 
You are knowledgeable about NSE/BSE listed companies, fundamental analysis, and Indian market dynamics.`;

/** Parse a natural language screener query into structured filter criteria */
export async function parseScreenerQuery(query: string): Promise<Record<string, unknown>> {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Parse this stock screener query into structured JSON filter criteria for Indian stocks.
Query: "${query}"

Return a JSON object with any of these optional fields:
{
  "sector": string or null,
  "marketCapCategory": "Large Cap" | "Mid Cap" | "Small Cap" | null,
  "minMarketCap": number (in crores) or null,
  "maxMarketCap": number (in crores) or null,
  "maxPE": number or null,
  "minPE": number or null,
  "minROE": number (percentage) or null,
  "minROCE": number (percentage) or null,
  "maxDebt": number or null,
  "minDividendYield": number (percentage) or null,
  "minSalesGrowth5yr": number (percentage) or null,
  "minProfitGrowth5yr": number (percentage) or null,
  "minPiotroskiScore": number or null,
  "sortBy": "marketCap" | "pe" | "roe" | "roce" | "dividendYield" | "salesGrowth5yr" | null,
  "sortOrder": "asc" | "desc" | null,
  "limit": number or null,
  "keywords": string[] (company name hints) or null,
  "explanation": string (brief explanation of what was parsed)
}

Return only valid JSON, no markdown.`,
      },
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content ?? '{}';
  return JSON.parse(content);
}

interface ScreenerCandidate {
  symbol: string;
  name: string;
  sector: string;
  industry?: string;
  marketCapCategory: string;
  marketCap: number;
  stockPE: number;
  pbRatio?: number;
  roe: number;
  roce: number;
  debtToEquity: number;
  dividendYield: number;
  salesGrowth5yr: number;
  profitVar5yr?: number;
  piotroskiScore?: number;
}

/** Rank screener candidates for a natural-language query using an LLM */
export async function rankScreenerCandidates(
  query: string,
  candidates: ScreenerCandidate[],
  limit: number
): Promise<string[]> {
  if (candidates.length === 0 || limit <= 0) return [];

  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Rank these Indian stocks for the user's screener requirement.
Query: "${query}"

Candidates:
${JSON.stringify(candidates)}

Return only valid JSON in this exact shape:
{
  "symbols": ["SYMBOL_1", "SYMBOL_2", "..."]
}

Rules:
- Order symbols from best match to weakest match for the query.
- Use full query intent, including multi-constraint trade-offs.
- Only include symbols from the candidate list.
- Return up to ${Math.min(limit, candidates.length)} symbols.`,
      },
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content ?? '{}';
  const parsed = JSON.parse(content) as { symbols?: unknown };
  const rankedSymbols = Array.isArray(parsed.symbols) ? parsed.symbols : [];
  return rankedSymbols.filter((value): value is string => typeof value === 'string');
}

/** Generate AI analysis for a stock */
export async function generateStockAnalysis(
  symbol: string,
  stockData: Record<string, unknown>
): Promise<{ pros: string[]; cons: string[]; summary: string; disclaimer: string }> {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Analyze ${symbol} based on this financial data and provide a structured analysis:
${JSON.stringify(stockData, null, 2)}

Return JSON with:
{
  "pros": ["up to 4 factual strengths based on the data"],
  "cons": ["up to 4 factual concerns based on the data"],
  "summary": "2-3 sentence factual overview of the company's financial position",
  "disclaimer": "standard risk disclaimer"
}

Be data-driven. Reference specific numbers. No buy/sell recommendations.
Return only valid JSON, no markdown.`,
      },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content ?? '{}';
  const parsed = JSON.parse(content);
  return {
    pros: parsed.pros ?? [],
    cons: parsed.cons ?? [],
    summary: parsed.summary ?? '',
    disclaimer:
      parsed.disclaimer ??
      'This analysis is for informational purposes only and does not constitute investment advice.',
  };
}

/** Generate Stock of the Day analysis */
export async function generateStockOfDay(
  symbol: string,
  stockData: Record<string, unknown>
): Promise<string> {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Generate a "Stock of the Day" feature for ${symbol}. Based on this data:
${JSON.stringify(stockData, null, 2)}

Write a concise 150-200 word analysis covering:
1. Why this stock is interesting today (data-driven)
2. Key financial metrics to watch
3. Sector context
4. Risk factors

End with: "⚠️ Not financial advice. Investing involves risk."
Do NOT make price predictions or buy/sell recommendations.`,
      },
    ],
    temperature: 0.5,
  });

  return response.choices[0].message.content ?? '';
}

/** Explain a financial metric in simple terms */
export async function explainMetric(metricName: string): Promise<string> {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Explain the financial metric "${metricName}" in 2-3 simple sentences suitable for a retail investor in India. Include what a "good" value typically looks like and any caveats.`,
      },
    ],
    temperature: 0.3,
    max_tokens: 200,
  });

  return response.choices[0].message.content ?? '';
}

/** Compare multiple stocks */
export async function compareStocks(
  symbols: string[],
  stocksData: Record<string, unknown>[]
): Promise<string> {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Compare these ${symbols.length} Indian stocks: ${symbols.join(', ')}

Data:
${JSON.stringify(stocksData, null, 2)}

Provide a factual comparison covering:
1. Valuation (PE, PB ratios)
2. Profitability (ROE, ROCE)
3. Growth (sales growth, profit growth)
4. Financial health (debt, current ratio)
5. Overall positioning (strengths of each)

Be concise, data-driven. End with risk disclaimer. No buy/sell recommendations.
⚠️ Not financial advice.`,
      },
    ],
    temperature: 0.3,
    max_tokens: 600,
  });

  return response.choices[0].message.content ?? '';
}

export default getOpenAI;
