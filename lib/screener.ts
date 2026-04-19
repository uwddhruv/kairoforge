import axios from 'axios';
import { sleep } from './utils';

const SCREENER_BASE = process.env.SCREENER_BASE_URL ?? 'https://www.screener.in';

const screenerClient = axios.create({
  baseURL: SCREENER_BASE,
  timeout: 15000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    Accept: 'application/json, text/html, */*',
    'Accept-Language': 'en-IN,en;q=0.9',
    Referer: SCREENER_BASE,
  },
});

export interface ScreenerStockData {
  symbol: string;
  name: string;
  currentPrice: number;
  marketCap: number;
  stockPE: number;
  bookValue: number;
  dividendYield: number;
  roce: number;
  roe: number;
  faceValue: number;
  high52w: number;
  low52w: number;
  eps: number;
  salesGrowth5yr: number;
  profitVar5yr: number;
  debtToEquity: number;
  currentRatio: number;
  promoterHolding: number;
  fiiHolding: number;
  diiHolding: number;
  sector: string;
  industry: string;
  intrinsicValue: number;
  grahamNumber: number;
  pbRatio: number;
  piotroskiScore: number;
}

function parseNumber(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  const str = String(val).replace(/[,%]/g, '').trim();
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/** Fetch company data from Screener.in */
export async function fetchScreenerData(symbol: string): Promise<Partial<ScreenerStockData>> {
  try {
    await sleep(1000); // respect rate limiting
    const url = `/company/${symbol.toUpperCase()}/consolidated/`;
    const response = await screenerClient.get(url);

    if (response.status !== 200) {
      throw new Error(`Screener returned ${response.status}`);
    }

    // Parse HTML to extract key metrics using regex patterns
    const html: string = response.data;

    const extract = (pattern: RegExp): number => {
      const match = html.match(pattern);
      return match ? parseNumber(match[1]) : 0;
    };

    const extractStr = (pattern: RegExp): string => {
      const match = html.match(pattern);
      return match ? match[1].trim() : '';
    };

    return {
      symbol: symbol.toUpperCase(),
      currentPrice: extract(/Current Price[^>]*>[\s]*(?:₹|Rs\.?)?[\s]*([\d,]+\.?\d*)/i),
      marketCap: extract(/Market Cap[^>]*>[\s]*(?:₹|Rs\.?)?[\s]*([\d,]+\.?\d*)/i),
      stockPE: extract(/Stock P\/E[^>]*>[\s]*([\d,]+\.?\d*)/i),
      bookValue: extract(/Book Value[^>]*>[\s]*([\d,]+\.?\d*)/i),
      dividendYield: extract(/Dividend Yield[^>]*>[\s]*([\d,]+\.?\d*)%?/i),
      roce: extract(/ROCE[^>]*>[\s]*([\d,]+\.?\d*)%?/i),
      roe: extract(/ROE[^>]*>[\s]*([\d,]+\.?\d*)%?/i),
      high52w: extract(/52 Week High[^>]*>[\s]*([\d,]+\.?\d*)/i),
      low52w: extract(/52 Week Low[^>]*>[\s]*([\d,]+\.?\d*)/i),
      sector: extractStr(/Sector[^>]*>[^<]*([\w\s&]+)<\/a>/i),
      industry: extractStr(/Industry[^>]*>[^<]*([\w\s&]+)<\/a>/i),
    };
  } catch (err) {
    console.error(`Failed to fetch Screener data for ${symbol}:`, err);
    return { symbol: symbol.toUpperCase() };
  }
}

/** Search companies on Screener.in */
export async function searchScreener(query: string): Promise<Array<{ symbol: string; name: string }>> {
  try {
    await sleep(300);
    const response = await screenerClient.get(`/api/company/search/?q=${encodeURIComponent(query)}&v=3`);
    if (!response.data?.results) return [];

    return response.data.results.slice(0, 10).map((r: { id?: string; symbol?: string; name?: string }) => ({
      symbol: r.id ?? r.symbol ?? '',
      name: r.name ?? '',
    }));
  } catch {
    return [];
  }
}
