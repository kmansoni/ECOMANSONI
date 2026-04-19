/**
 * Time Banking System.
 *
 * Tracks time saved/spent by the user and turns routing efficiency
 * into a personal time economy:
 * - Earn minutes when route optimization saves time
 * - Spend minutes on comfort/premium choices
 * - Invest minutes into habits with future return
 * - Gift minutes conceptually to shared family/community goals
 */

import type {
  TimeAccount,
  TimeTransaction,
  TimeInvestment,
} from '@/types/quantum-transport';
import { dbLoose } from '@/lib/supabase';

const accounts = new Map<string, TimeAccount>();

function createDefaultAccount(userId: string): TimeAccount {
  return {
    userId,
    balanceMinutes: 0,
    totalSavedMinutes: 0,
    totalSpentMinutes: 0,
    transactions: [],
    monthlyTrend: 0,
  };
}

function createTransactionId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function hydrateTransaction(row: {
  id: string;
  type: TimeTransaction['type'];
  minutes: number;
  description: string;
  route_id?: string | null;
  created_at: string;
}): TimeTransaction {
  return {
    id: row.id,
    type: row.type,
    minutes: Number(row.minutes ?? 0),
    description: row.description,
    routeId: row.route_id ?? undefined,
    timestamp: new Date(row.created_at),
  };
}

function persistAccount(userId: string, account: TimeAccount): void {
  void dbLoose.from('nav_time_bank_accounts').upsert({
    user_id: userId,
    balance_minutes: account.balanceMinutes,
    total_saved_minutes: account.totalSavedMinutes,
    total_spent_minutes: account.totalSpentMinutes,
    monthly_trend: account.monthlyTrend,
    updated_at: new Date().toISOString(),
  });
}

function persistTransaction(userId: string, tx: TimeTransaction): void {
  void dbLoose.from('nav_time_bank_transactions').insert({
    id: tx.id,
    user_id: userId,
    type: tx.type,
    minutes: tx.minutes,
    description: tx.description,
    route_id: tx.routeId ?? null,
    created_at: tx.timestamp.toISOString(),
  });
}

export async function loadTimeAccount(userId: string, transactionLimit = 50): Promise<TimeAccount> {
  const [{ data: accountRow }, { data: transactionRows }] = await Promise.all([
    dbLoose
      .from('nav_time_bank_accounts')
      .select('balance_minutes, total_saved_minutes, total_spent_minutes, monthly_trend')
      .eq('user_id', userId)
      .maybeSingle(),
    dbLoose
      .from('nav_time_bank_transactions')
      .select('id, type, minutes, description, route_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(transactionLimit),
  ]);

  const account: TimeAccount = {
    userId,
    balanceMinutes: Number(accountRow?.balance_minutes ?? 0),
    totalSavedMinutes: Number(accountRow?.total_saved_minutes ?? 0),
    totalSpentMinutes: Number(accountRow?.total_spent_minutes ?? 0),
    monthlyTrend: Number(accountRow?.monthly_trend ?? 0),
    transactions: Array.isArray(transactionRows)
      ? transactionRows.map((row) => hydrateTransaction(row))
      : [],
  };

  if (!accountRow) {
    recalculateTrend(account);
    persistAccount(userId, account);
  }

  accounts.set(userId, account);
  return account;
}

export async function listTimeTransactions(userId: string, limit = 20): Promise<TimeTransaction[]> {
  const { data } = await dbLoose
    .from('nav_time_bank_transactions')
    .select('id, type, minutes, description, route_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return Array.isArray(data) ? data.map((row) => hydrateTransaction(row)) : [];
}

export function getTimeAccount(userId: string): TimeAccount {
  const existing = accounts.get(userId);
  if (existing) return existing;

  const account = createDefaultAccount(userId);
  accounts.set(userId, account);
  return account;
}

export function recordTimeSaved(userId: string, minutes: number, routeId?: string, description?: string): TimeAccount {
  const account = getTimeAccount(userId);
  const delta = Math.max(0, Math.round(minutes));

  const tx: TimeTransaction = {
    id: createTransactionId(),
    type: 'earned',
    minutes: delta,
    description: description ?? `Сэкономлено на маршруте ${routeId ?? 'unknown'}`,
    routeId,
    timestamp: new Date(),
  };

  account.balanceMinutes += delta;
  account.totalSavedMinutes += delta;
  account.transactions.unshift(tx);
  recalculateTrend(account);
  persistTransaction(userId, tx);
  persistAccount(userId, account);
  return account;
}

export function spendTime(userId: string, minutes: number, description: string, routeId?: string): TimeAccount {
  const account = getTimeAccount(userId);
  const delta = Math.max(0, Math.round(minutes));

  const tx: TimeTransaction = {
    id: createTransactionId(),
    type: 'spent',
    minutes: delta,
    description,
    routeId,
    timestamp: new Date(),
  };

  account.balanceMinutes = Math.max(0, account.balanceMinutes - delta);
  account.totalSpentMinutes += delta;
  account.transactions.unshift(tx);
  recalculateTrend(account);
  persistTransaction(userId, tx);
  persistAccount(userId, account);
  return account;
}

export function investTime(
  userId: string,
  investment: Omit<TimeInvestment, 'confidence'> & { confidence?: number }
): { account: TimeAccount; investment: TimeInvestment } {
  const account = getTimeAccount(userId);
  const minutes = Math.max(0, Math.round(investment.investMinutes));

  account.balanceMinutes = Math.max(0, account.balanceMinutes - minutes);
  account.totalSpentMinutes += minutes;

  const tx: TimeTransaction = {
    id: createTransactionId(),
    type: 'invested',
    minutes,
    description: investment.description,
    timestamp: new Date(),
  };

  account.transactions.unshift(tx);
  recalculateTrend(account);
  persistTransaction(userId, tx);
  persistAccount(userId, account);

  return {
    account,
    investment: {
      ...investment,
      confidence: investment.confidence ?? estimateInvestmentConfidence(investment.riskLevel),
    },
  };
}

export function giftTime(userId: string, minutes: number, description: string): TimeAccount {
  const account = getTimeAccount(userId);
  const delta = Math.max(0, Math.round(minutes));

  const tx: TimeTransaction = {
    id: createTransactionId(),
    type: 'gifted',
    minutes: delta,
    description,
    timestamp: new Date(),
  };

  account.balanceMinutes = Math.max(0, account.balanceMinutes - delta);
  account.totalSpentMinutes += delta;
  account.transactions.unshift(tx);
  recalculateTrend(account);
  persistTransaction(userId, tx);
  persistAccount(userId, account);
  return account;
}

export function suggestTimeInvestments(userId: string): TimeInvestment[] {
  const account = getTimeAccount(userId);
  const balance = account.balanceMinutes;

  const ideas: TimeInvestment[] = [
    {
      description: 'Изучить альтернативный маршрут до работы',
      investMinutes: 20,
      expectedReturnMinutes: 120,
      returnPeriodDays: 30,
      riskLevel: 'low',
      confidence: 0.82,
    },
    {
      description: 'Сдвинуть выезд на 15 минут раньше, чтобы обходить пик',
      investMinutes: 15,
      expectedReturnMinutes: 180,
      returnPeriodDays: 14,
      riskLevel: 'low',
      confidence: 0.86,
    },
    {
      description: 'Попробовать мультимодальный сценарий с последней милей пешком',
      investMinutes: 25,
      expectedReturnMinutes: 90,
      returnPeriodDays: 21,
      riskLevel: 'medium',
      confidence: 0.64,
    },
    {
      description: 'Перестроить недельный паттерн поездок под менее загруженные окна',
      investMinutes: 60,
      expectedReturnMinutes: 360,
      returnPeriodDays: 45,
      riskLevel: 'high',
      confidence: 0.51,
    },
  ];

  return ideas.filter(idea => idea.investMinutes <= balance + 30);
}

export function summarizeTimeValue(userId: string): string {
  const account = getTimeAccount(userId);
  const hoursSaved = (account.totalSavedMinutes / 60).toFixed(1);
  const balanceHours = (account.balanceMinutes / 60).toFixed(1);

  if (account.totalSavedMinutes === 0) {
    return 'Временной капитал ещё не накоплен.';
  }

  return `Накоплено ${hoursSaved} ч сэкономленного времени, доступный баланс: ${balanceHours} ч.`;
}

function recalculateTrend(account: TimeAccount): void {
  const now = Date.now();
  const last30Days = account.transactions.filter(tx => now - tx.timestamp.getTime() <= 30 * 24 * 60 * 60 * 1000);

  const earned = last30Days.filter(tx => tx.type === 'earned').reduce((sum, tx) => sum + tx.minutes, 0);
  const spent = last30Days.filter(tx => tx.type !== 'earned').reduce((sum, tx) => sum + tx.minutes, 0);
  account.monthlyTrend = earned - spent;
}

function estimateInvestmentConfidence(riskLevel: TimeInvestment['riskLevel']): number {
  switch (riskLevel) {
    case 'low':
      return 0.85;
    case 'medium':
      return 0.65;
    case 'high':
      return 0.45;
    default:
      return 0.5;
  }
}
