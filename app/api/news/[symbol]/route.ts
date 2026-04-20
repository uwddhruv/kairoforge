import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import axios from 'axios';

const NEWS_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_NEWS_ARTICLES = 6;

interface NewsArticle {
  title: string;
  description?: string;
  url: string;
  publishedAt: string;
  source?: { name: string };
}

function isValidArticle(article: Partial<NewsArticle>): article is NewsArticle {
  const title = article.title?.trim();
  const url = article.url?.trim();
  const publishedAt = article.publishedAt?.trim();

  if (!title || !url || !publishedAt) return false;
  return !Number.isNaN(Date.parse(publishedAt));
}

async function fetchGNewsHeadlines(symbol: string, companyName: string) {
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) return [];

  try {
    const query = encodeURIComponent(`${companyName} ${symbol} NSE`);
    const response = await axios.get(
      `https://gnews.io/api/v4/search?q=${query}&lang=en&country=in&max=${MAX_NEWS_ARTICLES}&token=${apiKey}`,
      { timeout: 5000 }
    );
    return response.data.articles ?? [];
  } catch {
    return [];
  }
}

function cleanRssText(text: string) {
  return text
    .replace(/^<!\[CDATA\[|\]\]>$/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

async function fetchGoogleNewsRssHeadlines(symbol: string, companyName: string): Promise<NewsArticle[]> {
  try {
    const query = encodeURIComponent(`${companyName} ${symbol} NSE stock`);
    const url = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;
    const response = await axios.get<string>(url, { timeout: 5000, responseType: 'text' });
    const xml = response.data;

    const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
    return items.slice(0, MAX_NEWS_ARTICLES).map((item) => {
      const title = cleanRssText(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
      const link = cleanRssText(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '');
      const description = cleanRssText(item.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? '');
      const publishedAtRaw = cleanRssText(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? '');
      const sourceName = cleanRssText(item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? '');

      return {
        title,
        description: description || undefined,
        url: link,
        publishedAt: publishedAtRaw,
        source: sourceName ? { name: sourceName } : undefined,
      };
    }).filter(isValidArticle);
  } catch {
    return [];
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.toUpperCase();

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

    let articles: NewsArticle[] = [];
    if (stock) {
      articles = await fetchGNewsHeadlines(symbol, stock.name);
      if (articles.length === 0) {
        articles = await fetchGoogleNewsRssHeadlines(symbol, stock.name);
      }
    }

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
