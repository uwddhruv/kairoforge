import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format number in Indian number system (lakhs, crores) */
export function formatIndianNumber(value: number, decimals = 2): string {
  if (isNaN(value) || value === 0) return '0';
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  }).format(value);
}

/** Format as Indian currency (₹) */
export function formatCurrency(value: number, decimals = 2): string {
  if (isNaN(value)) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  }).format(value);
}

/** Format market cap in Cr/L notation */
export function formatMarketCap(crores: number): string {
  if (crores >= 1_00_000) {
    return `₹${(crores / 1_00_000).toFixed(2)}L Cr`;
  }
  if (crores >= 1_000) {
    return `₹${(crores / 1_000).toFixed(2)}K Cr`;
  }
  return `₹${formatIndianNumber(crores)} Cr`;
}

/** Sleep utility */
export const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/** Check if Indian market is currently open */
export function isMarketOpen(): boolean {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay();
  const hours = ist.getHours();
  const minutes = ist.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  // Monday=1 to Friday=5, 9:15 AM (555) to 3:30 PM (930)
  if (day < 1 || day > 5) return false;
  return totalMinutes >= 555 && totalMinutes <= 930;
}

/** Get change percentage color class */
export function getChangeColor(change: number): string {
  if (change > 0) return 'text-green-400';
  if (change < 0) return 'text-red-400';
  return 'text-gray-400';
}

/** Classify market cap */
export function classifyMarketCap(crores: number): string {
  if (crores >= 20000) return 'Large Cap';
  if (crores >= 5000) return 'Mid Cap';
  return 'Small Cap';
}

/** Truncate text */
export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}
