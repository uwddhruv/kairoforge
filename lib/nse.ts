import axios from 'axios';
import { sleep } from './utils';

const NSE_BASE = process.env.NSE_BASE_URL ?? 'https://www.nseindia.com/api';

// NSE requires session cookies from the main site
let nseSession: { cookies: string; lastRefreshed: number } | null = null;
const SESSION_TTL = 5 * 60 * 1000; // 5 minutes

/** Refresh NSE session cookies by visiting the main site */
async function refreshNSESession(): Promise<void> {
  try {
    const response = await axios.get('https://www.nseindia.com', {
      timeout: 10000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-IN,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
      },
    });

    const setCookies = response.headers['set-cookie'];
    if (setCookies) {
      nseSession = {
        cookies: setCookies.map((c: string) => c.split(';')[0]).join('; '),
        lastRefreshed: Date.now(),
      };
    }
  } catch (err) {
    console.error('Failed to refresh NSE session:', err);
  }
}

/** Get valid NSE session (refreshes if expired) */
async function getNSESession(): Promise<string> {
  if (!nseSession || Date.now() - nseSession.lastRefreshed > SESSION_TTL) {
    await refreshNSESession();
  }
  return nseSession?.cookies ?? '';
}

/** Make an authenticated NSE API request */
async function nseGet<T>(endpoint: string): Promise<T> {
  const cookies = await getNSESession();
  await sleep(300);

  const response = await axios.get<T>(`${NSE_BASE}${endpoint}`, {
    timeout: 10000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-IN,en;q=0.9',
      Referer: 'https://www.nseindia.com/',
      Cookie: cookies,
    },
  });

  return response.data;
}

export interface NSEQuote {
  symbol: string;
  companyName: string;
  lastPrice: number;
  change: number;
  pChange: number;
  open: number;
  high: number;
  low: number;
  closePrice: number;
  previousClose: number;
  totalTradedVolume: number;
  totalTradedValue: number;
  weekHighLow: { min: number; max: number; minDate: string; maxDate: string };
  marketCap: number;
}

export interface NSEIndex {
  index: string;
  indexSymbol: string;
  last: number;
  percentChange: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  advance: { declines: number; advances: number; unchanged: number };
}

/** Get real-time quote for a symbol */
export async function getNSEQuote(symbol: string): Promise<NSEQuote | null> {
  try {
    const data = await nseGet<{ priceInfo: NSEQuote; info: { symbol: string; companyName: string } }>(
      `/quote-equity?symbol=${encodeURIComponent(symbol.toUpperCase())}`
    );
    return {
      ...data.priceInfo,
      symbol: data.info.symbol,
      companyName: data.info.companyName,
    };
  } catch {
    return null;
  }
}

/** Get market indices (NIFTY 50, SENSEX, BANK NIFTY) */
export async function getMarketIndices(): Promise<NSEIndex[]> {
  try {
    const data = await nseGet<{ data: NSEIndex[] }>('/allIndices');
    const relevantIndices = ['NIFTY 50', 'NIFTY BANK', 'NIFTY IT', 'NIFTY MIDCAP 100'];
    return (data.data ?? []).filter(idx => relevantIndices.includes(idx.index));
  } catch {
    return [];
  }
}

/** Get top gainers on NSE */
export async function getTopGainers(): Promise<NSEQuote[]> {
  try {
    const data = await nseGet<{ data: NSEQuote[] }>('/live-analysis-variations?index=gainers');
    return (data.data ?? []).slice(0, 10);
  } catch {
    return [];
  }
}

/** Get top losers on NSE */
export async function getTopLosers(): Promise<NSEQuote[]> {
  try {
    const data = await nseGet<{ data: NSEQuote[] }>('/live-analysis-variations?index=losers');
    return (data.data ?? []).slice(0, 10);
  } catch {
    return [];
  }
}

/** Check if Indian market (NSE) is currently open */
export function isMarketOpen(): boolean {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay();
  const hours = ist.getHours();
  const minutes = ist.getMinutes();
  const totalMinutes = hours * 60 + minutes;
  if (day < 1 || day > 5) return false;
  return totalMinutes >= 555 && totalMinutes <= 930;
}

/** Get market status string */
export function getMarketStatus(): { open: boolean; message: string } {
  const open = isMarketOpen();
  if (open) {
    return { open: true, message: 'Market Open' };
  }
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay();
  if (day === 0 || day === 6) {
    return { open: false, message: 'Market Closed (Weekend)' };
  }
  const hours = ist.getHours();
  if (hours < 9 || (hours === 9 && ist.getMinutes() < 15)) {
    return { open: false, message: 'Pre-Market' };
  }
  return { open: false, message: 'Market Closed' };
}
