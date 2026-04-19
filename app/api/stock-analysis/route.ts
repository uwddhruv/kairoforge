import { NextRequest, NextResponse } from 'next/server';
import { generateStockAnalysis } from '@/lib/openai';

export async function POST(req: NextRequest) {
  try {
    const { symbol, stockData } = await req.json() as { symbol: string; stockData: Record<string, unknown> };

    if (!symbol) {
      return NextResponse.json({ error: 'symbol required' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        pros: ['Data available in database'],
        cons: ['OpenAI API key not configured'],
        summary: `${symbol} is listed on the Indian stock exchange.`,
        disclaimer: 'Not financial advice. Always consult a SEBI-registered investment advisor.',
      });
    }

    const analysis = await generateStockAnalysis(symbol, stockData ?? {});
    return NextResponse.json(analysis);
  } catch (err) {
    console.error('Stock analysis error:', err);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
