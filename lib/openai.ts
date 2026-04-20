import OpenAI from 'openai';

type LlmProvider = {
  name: 'openai' | 'perplexity';
  apiKey: string;
  model: string;
  baseURL?: string;
  supportsJsonResponseFormat: boolean;
};

const providerClients = new Map<string, OpenAI>();

function getProviders(): LlmProvider[] {
  const providers: LlmProvider[] = [];

  if (process.env.OPENAI_API_KEY) {
    providers.push({
      name: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL ?? 'gpt-4o',
      baseURL: process.env.OPENAI_BASE_URL,
      supportsJsonResponseFormat: true,
    });
  }

  if (process.env.PERPLEXITY_API_KEY) {
    providers.push({
      name: 'perplexity',
      apiKey: process.env.PERPLEXITY_API_KEY,
      model: process.env.PERPLEXITY_MODEL ?? 'sonar-pro',
      baseURL: process.env.PERPLEXITY_BASE_URL ?? 'https://api.perplexity.ai',
      supportsJsonResponseFormat: false,
    });
  }

  return providers;
}

export function hasLlmProvider(): boolean {
  return getProviders().length > 0;
}

function getClient(provider: LlmProvider): OpenAI {
  const clientKey = [
    provider.name,
    provider.baseURL ?? 'default',
    provider.model,
  ].join(':');

  if (!providerClients.has(clientKey)) {
    providerClients.set(
      clientKey,
      new OpenAI({
        apiKey: provider.apiKey,
        baseURL: provider.baseURL,
      })
    );
  }

  return providerClients.get(clientKey)!;
}

function parseJsonResponse<T>(content: string): T {
  try {
    return JSON.parse(content) as T;
  } catch {
    const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const fenced = fenceMatch?.[1]?.trim();
    if (fenced) {
      return JSON.parse(fenced) as T;
    }

    const objectMatch = content.match(/\{[\s\S]*\}/);
    if (objectMatch?.[0]) {
      return JSON.parse(objectMatch[0]) as T;
    }

    throw new Error('Unable to parse JSON response from LLM');
  }
}

type ChatOptions = {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature: number;
  max_tokens?: number;
  expectJson?: boolean;
};

async function runChatCompletion(options: ChatOptions): Promise<string> {
  const providers = getProviders();
  if (providers.length === 0) {
    throw new Error('No configured LLM provider');
  }

  let lastError: unknown = null;

  for (const provider of providers) {
    try {
      const client = getClient(provider);
      const response = await client.chat.completions.create({
        model: provider.model,
        messages: options.messages,
        temperature: options.temperature,
        ...(options.max_tokens !== undefined ? { max_tokens: options.max_tokens } : {}),
        ...(options.expectJson && provider.supportsJsonResponseFormat
          ? { response_format: { type: 'json_object' as const } }
          : {}),
      });

      const content = response.choices[0]?.message?.content ?? '';
      if (content) return content;
      lastError = new Error(`Empty response from ${provider.name}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('All LLM providers failed');
}

const SYSTEM_PROMPT = `You are an Indian stock market analyst assistant for KairoForge. 
Be factual, data-driven, and concise. 
Do not provide buy/sell recommendations. 
Always include a risk disclaimer. 
You are knowledgeable about NSE/BSE listed companies, fundamental analysis, and Indian market dynamics.`;

/** Parse a natural language screener query into structured filter criteria */
export async function parseScreenerQuery(query: string): Promise<Record<string, unknown>> {
  const content = await runChatCompletion({
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
    expectJson: true,
  });

  return parseJsonResponse<Record<string, unknown>>(content);
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

  const content = await runChatCompletion({
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
- Return exactly ${Math.min(limit, candidates.length)} symbols when at least that many candidates are available; otherwise return all candidates.`,
      },
    ],
    temperature: 0.1,
    expectJson: true,
  });

  const parsed = parseJsonResponse<{ symbols?: unknown }>(content);
  const rankedSymbols = Array.isArray(parsed.symbols) ? parsed.symbols : [];
  return rankedSymbols.filter((value): value is string => typeof value === 'string');
}

/** Generate AI analysis for a stock */
export async function generateStockAnalysis(
  symbol: string,
  stockData: Record<string, unknown>
): Promise<{ pros: string[]; cons: string[]; summary: string; disclaimer: string }> {
  const content = await runChatCompletion({
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
    expectJson: true,
  });

  const parsed = parseJsonResponse<Record<string, unknown>>(content);
  const pros = filterStringArray(parsed.pros);
  const cons = filterStringArray(parsed.cons);

  return {
    pros,
    cons,
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    disclaimer:
      typeof parsed.disclaimer === 'string'
        ? parsed.disclaimer
        : 'This analysis is for informational purposes only and does not constitute investment advice.',
  };
}

/** Generate Stock of the Day analysis */
export async function generateStockOfDay(
  symbol: string,
  stockData: Record<string, unknown>
): Promise<string> {
  const content = await runChatCompletion({
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

  return content;
}

/** Explain a financial metric in simple terms */
export async function explainMetric(metricName: string): Promise<string> {
  return runChatCompletion({
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
}

/** Compare multiple stocks */
export async function compareStocks(
  symbols: string[],
  stocksData: Record<string, unknown>[]
): Promise<string> {
  return runChatCompletion({
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
}
function filterStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
