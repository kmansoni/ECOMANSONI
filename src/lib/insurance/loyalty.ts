import type { LoyaltyLevel } from '@/types/insurance';
import { LOYALTY_LEVELS, getLoyaltyInfo, getNextLevel } from '@/types/insurance';

export function getLoyaltyProgress(level: LoyaltyLevel, premiums: number): number {
  const next = getNextLevel(level);
  if (!next) return 100;
  const current = getLoyaltyInfo(level);
  const range = next.threshold - current.threshold;
  const progress = premiums - current.threshold;
  return Math.min(Math.round((progress / range) * 100), 100);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(amount);
}

export { LOYALTY_LEVELS, getLoyaltyInfo, getNextLevel };
