import { NextRequest, NextResponse } from 'next/server';
import { generateStockAnalysis } from '@/lib/openai';

const FUNDAMENTAL_THRESHOLDS = {
  healthyRoe: 15,
  lowRoe: 10,
  manageableDebtToEquity: 1,
  highDebtToEquity: 1.5,
  strongSalesGrowth5yr: 10,
  meaningfulDividendYield: 1.5,
  expensivePe: 40,
};

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function buildFallbackAnalysis(symbol: string, stockData: Record<string, unknown>) {
  const pe = toNumber(stockData.stockPE);
  const roe = toNumber(stockData.roe);
  const debtToEquity = toNumber(stockData.debtToEquity);
  const salesGrowth5yr = toNumber(stockData.salesGrowth5yr);
  const profitChange5yr = toNumber(stockData.profitVar5yr);
  const dividendYield = toNumber(stockData.dividendYield);

  const pros: string[] = [];
  const cons: string[] = [];

  if (roe !== null && roe >= FUNDAMENTAL_THRESHOLDS.healthyRoe) pros.push(`Healthy ROE at ${roe.toFixed(1)}%.`);
  if (debtToEquity !== null && debtToEquity <= FUNDAMENTAL_THRESHOLDS.manageableDebtToEquity) pros.push(`Manageable debt-to-equity at ${debtToEquity.toFixed(2)}.`);
  if (salesGrowth5yr !== null && salesGrowth5yr >= FUNDAMENTAL_THRESHOLDS.strongSalesGrowth5yr) pros.push(`Strong 5Y sales growth of ${salesGrowth5yr.toFixed(1)}%.`);
  if (dividendYield !== null && dividendYield >= FUNDAMENTAL_THRESHOLDS.meaningfulDividendYield) pros.push(`Dividend yield of ${dividendYield.toFixed(2)}% adds shareholder return.`);

  if (pe !== null && pe > FUNDAMENTAL_THRESHOLDS.expensivePe) cons.push(`Valuation looks expensive with P/E at ${pe.toFixed(1)}.`);
  if (debtToEquity !== null && debtToEquity > FUNDAMENTAL_THRESHOLDS.highDebtToEquity) cons.push(`Leverage risk: debt-to-equity is ${debtToEquity.toFixed(2)}.`);
  if (profitChange5yr !== null && profitChange5yr < 0) cons.push(`5Y profit trend is weak at ${profitChange5yr.toFixed(1)}%.`);
  if (roe !== null && roe < FUNDAMENTAL_THRESHOLDS.lowRoe) cons.push(`ROE at ${roe.toFixed(1)}% is below ideal profitability levels.`);

  if (pros.length === 0) pros.push('Financial profile appears mixed with no standout strength from available metrics.');
  if (cons.length === 0) cons.push('No major red flags from the available metrics, but monitor quarterly execution closely.');

  return {
    pros: pros.slice(0, 4),
    cons: cons.slice(0, 4),
    summary: `${symbol} shows a mixed fundamental profile based on current database metrics. Review the latest quarterly filings and sector trends before taking any investment decision.`,
    disclaimer: 'Not financial advice. Always consult a SEBI-registered investment advisor.',
  };
}

export async function POST(req: NextRequest) {
  try {
    const { symbol, stockData } = await req.json() as { symbol: string; stockData: Record<string, unknown> };

    if (!symbol) {
      return NextResponse.json({ error: 'symbol required' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(buildFallbackAnalysis(symbol, stockData ?? {}));
    }

    try {
      const analysis = await generateStockAnalysis(symbol, stockData ?? {});
      return NextResponse.json({
        pros: Array.isArray(analysis.pros) ? analysis.pros : [],
        cons: Array.isArray(analysis.cons) ? analysis.cons : [],
        summary: typeof analysis.summary === 'string' ? analysis.summary : '',
        disclaimer: typeof analysis.disclaimer === 'string'
          ? analysis.disclaimer
          : 'Not financial advice. Always consult a SEBI-registered investment advisor.',
      });
    } catch (analysisError) {
      console.error('Stock analysis fallback:', analysisError);
      return NextResponse.json(buildFallbackAnalysis(symbol, stockData ?? {}));
    }
  } catch (err) {
    console.error('Stock analysis error:', err);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
