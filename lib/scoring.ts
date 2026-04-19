import type { Stock } from '@prisma/client';

export interface StockScore {
  total: number; // 0-100
  valuation: number; // 0-25
  profitability: number; // 0-25
  growth: number; // 0-25
  financial_health: number; // 0-25
  label: string;
  color: string;
}

/**
 * Calculate a composite quality score for a stock (0-100).
 * This is a quantitative heuristic — NOT financial advice.
 */
export function calculateStockScore(stock: Partial<Stock>): StockScore {
  let valuation = 0;
  let profitability = 0;
  let growth = 0;
  let financialHealth = 0;

  // --- Valuation (25 pts) ---
  // PE ratio (lower is generally better for value, but 0 can mean loss)
  if (stock.stockPE && stock.stockPE > 0) {
    if (stock.stockPE < 15) valuation += 10;
    else if (stock.stockPE < 25) valuation += 7;
    else if (stock.stockPE < 40) valuation += 4;
    else valuation += 1;
  }

  // PB ratio
  if (stock.pbRatio && stock.pbRatio > 0) {
    if (stock.pbRatio < 1.5) valuation += 8;
    else if (stock.pbRatio < 3) valuation += 5;
    else if (stock.pbRatio < 5) valuation += 3;
    else valuation += 1;
  }

  // Intrinsic value vs price (margin of safety)
  if (stock.intrinsicValue && stock.currentPrice && stock.intrinsicValue > 0) {
    const margin = (stock.intrinsicValue - stock.currentPrice) / stock.intrinsicValue;
    if (margin > 0.3) valuation += 7;
    else if (margin > 0.1) valuation += 5;
    else if (margin > -0.1) valuation += 2;
  }

  // --- Profitability (25 pts) ---
  // ROE
  if (stock.roe) {
    if (stock.roe >= 20) profitability += 10;
    else if (stock.roe >= 15) profitability += 7;
    else if (stock.roe >= 10) profitability += 4;
    else if (stock.roe > 0) profitability += 2;
  }

  // ROCE
  if (stock.roce) {
    if (stock.roce >= 20) profitability += 10;
    else if (stock.roce >= 15) profitability += 7;
    else if (stock.roce >= 10) profitability += 4;
    else if (stock.roce > 0) profitability += 2;
  }

  // Dividend yield bonus
  if (stock.dividendYield && stock.dividendYield >= 2) profitability += 5;
  else if (stock.dividendYield && stock.dividendYield >= 1) profitability += 3;

  // --- Growth (25 pts) ---
  // 5yr sales growth
  if (stock.salesGrowth5yr) {
    if (stock.salesGrowth5yr >= 20) growth += 13;
    else if (stock.salesGrowth5yr >= 12) growth += 9;
    else if (stock.salesGrowth5yr >= 6) growth += 5;
    else if (stock.salesGrowth5yr > 0) growth += 2;
  }

  // 5yr profit growth
  if (stock.profitVar5yr) {
    if (stock.profitVar5yr >= 20) growth += 12;
    else if (stock.profitVar5yr >= 10) growth += 8;
    else if (stock.profitVar5yr >= 3) growth += 4;
    else if (stock.profitVar5yr > 0) growth += 1;
  }

  // --- Financial Health (25 pts) ---
  // Debt to Equity
  if (stock.debtToEquity !== undefined) {
    if (stock.debtToEquity <= 0.1) financialHealth += 8;
    else if (stock.debtToEquity <= 0.5) financialHealth += 6;
    else if (stock.debtToEquity <= 1) financialHealth += 4;
    else if (stock.debtToEquity <= 2) financialHealth += 2;
  }

  // Current ratio
  if (stock.currentRatio) {
    if (stock.currentRatio >= 2) financialHealth += 7;
    else if (stock.currentRatio >= 1.5) financialHealth += 5;
    else if (stock.currentRatio >= 1) financialHealth += 3;
  }

  // Piotroski Score
  if (stock.piotroskiScore) {
    if (stock.piotroskiScore >= 7) financialHealth += 10;
    else if (stock.piotroskiScore >= 5) financialHealth += 6;
    else if (stock.piotroskiScore >= 3) financialHealth += 3;
  }

  // Promoter holding stability
  if (stock.promoterHolding) {
    if (stock.promoterHolding >= 60) financialHealth += 3;
    else if (stock.promoterHolding >= 45) financialHealth += 2;
  }

  // Cap each category at 25
  valuation = Math.min(25, valuation);
  profitability = Math.min(25, profitability);
  growth = Math.min(25, growth);
  financialHealth = Math.min(25, financialHealth);

  const total = valuation + profitability + growth + financialHealth;

  let label: string;
  let color: string;
  if (total >= 80) { label = 'Excellent'; color = '#22c55e'; }
  else if (total >= 65) { label = 'Good'; color = '#84cc16'; }
  else if (total >= 50) { label = 'Fair'; color = '#f59e0b'; }
  else if (total >= 35) { label = 'Weak'; color = '#f97316'; }
  else { label = 'Poor'; color = '#ef4444'; }

  return {
    total,
    valuation,
    profitability,
    growth,
    financial_health: financialHealth,
    label,
    color,
  };
}

/** Get PEG ratio classification */
export function classifyPEG(peg: number): { label: string; color: string } {
  if (peg <= 0) return { label: 'N/A', color: '#6b7280' };
  if (peg < 1) return { label: 'Undervalued', color: '#22c55e' };
  if (peg < 1.5) return { label: 'Fair', color: '#f59e0b' };
  if (peg < 2) return { label: 'Slightly High', color: '#f97316' };
  return { label: 'Overvalued', color: '#ef4444' };
}

/** Calculate Graham Number */
export function calcGrahamNumber(eps: number, bookValue: number): number {
  if (eps <= 0 || bookValue <= 0) return 0;
  return Math.sqrt(22.5 * eps * bookValue);
}
