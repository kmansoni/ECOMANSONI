import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleCors, getCorsHeaders } from '../_shared/utils.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type Action = 'get_balance' | 'request_withdrawal' | 'get_history';
type LoyaltyLevel = 'novice' | 'agent' | 'agent2' | 'authorized' | 'authorized_plus';

const LOYALTY_THRESHOLDS: Record<LoyaltyLevel, { bonus: number; name: string }> = {
  novice:          { bonus: 0,  name: 'Новичок' },
  agent:           { bonus: 5,  name: 'Агент' },
  agent2:          { bonus: 8,  name: 'Агент 2.0' },
  authorized:      { bonus: 12, name: 'Уполномоченный' },
  authorized_plus: { bonus: 15, name: 'Уполномоченный+' },
};

const LEVEL_ORDER: { level: LoyaltyLevel; threshold: number }[] = [
  { level: 'novice',          threshold: 0 },
  { level: 'agent',           threshold: 30_000 },
  { level: 'agent2',          threshold: 75_000 },
  { level: 'authorized',      threshold: 150_000 },
  { level: 'authorized_plus', threshold: 300_000 },
];

function nextLevel(current: LoyaltyLevel) {
  const idx = LEVEL_ORDER.findIndex(l => l.level === current);
  if (idx < 0 || idx >= LEVEL_ORDER.length - 1) return null;
  return LEVEL_ORDER[idx + 1];
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');

  if (req.method !== 'POST') {
    return json({ error: 'Метод не поддерживается' }, 405, origin);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Требуется авторизация' }, 401, origin);
    }

    // user-scoped client для RLS
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: 'Не авторизован' }, 401, origin);

    const body = await req.json().catch(() => ({}));
    const action = body.action as Action;

    // ── Получаем профиль агента ──
    const { data: agent, error: agentErr } = await userClient
      .from('agent_profiles')
      .select('id, total_earned, available_balance, loyalty_level, quarterly_premiums')
      .eq('user_id', user.id)
      .single();

    if (agentErr || !agent) {
      return json({ error: 'Профиль агента не найден' }, 404, origin);
    }

    // ─────────── get_balance ───────────
    if (action === 'get_balance') {
      return json(await buildBalance(userClient, agent), 200, origin);
    }

    // ─────────── request_withdrawal ───────────
    if (action === 'request_withdrawal') {
      const amount = Number(body.amount);
      const paymentMethod = String(body.paymentMethod || '');

      if (!amount || amount < 1000) {
        return json({ error: 'Минимальная сумма вывода — 1 000 ₽' }, 400, origin);
      }
      if (!paymentMethod) {
        return json({ error: 'Укажите способ выплаты' }, 400, origin);
      }

      const balance = await buildBalance(userClient, agent);
      if (amount > balance.available) {
        return json({ error: 'Недостаточно средств' }, 400, origin);
      }

      // service-role для вставки — обходим RLS
      const admin = createClient(SUPABASE_URL, SERVICE_KEY);
      const { data: payout, error: payoutErr } = await admin
        .from('insurance_payouts')
        .insert({
          agent_id: agent.id,
          amount,
          status: 'pending',
          payment_method: paymentMethod,
          payment_details: {},
        })
        .select('id, status')
        .single();

      if (payoutErr) {
        console.error('[insurance-agent-balance] Ошибка создания заявки', payoutErr);
        return json({ error: 'Не удалось создать заявку на вывод' }, 500, origin);
      }

      return json({ payoutId: payout.id, status: payout.status }, 200, origin);
    }

    // ─────────── get_history ───────────
    if (action === 'get_history') {
      const period = body.period || 'month';
      const page = Math.max(1, Number(body.page) || 1);
      const limit = 50;
      const offset = (page - 1) * limit;

      const since = periodStart(period);

      // комиссии
      let commQ = userClient
        .from('insurance_commissions')
        .select('id, amount, rate, status, created_at', { count: 'exact' })
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false });

      if (since) commQ = commQ.gte('created_at', since);

      const { data: commissions, count: commCount } = await commQ
        .range(offset, offset + limit - 1);

      // выплаты
      let payQ = userClient
        .from('insurance_payouts')
        .select('id, amount, status, payment_method, created_at', { count: 'exact' })
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false });

      if (since) payQ = payQ.gte('created_at', since);

      const { data: payouts, count: payCount } = await payQ
        .range(offset, offset + limit - 1);

      const items = [
        ...(commissions ?? []).map(c => ({ ...c, kind: 'commission' as const })),
        ...(payouts ?? []).map(p => ({ ...p, kind: 'payout' as const })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
       .slice(0, limit);

      return json({ items, total: (commCount ?? 0) + (payCount ?? 0) }, 200, origin);
    }

    return json({ error: `Неизвестное действие: ${action}` }, 400, origin);
  } catch (err) {
    console.error('[insurance-agent-balance]', err);
    return json({ error: (err as Error).message || 'Внутренняя ошибка' }, 500, origin);
  }
});

// ── Helpers ──

interface AgentRow {
  id: string;
  total_earned: number;
  available_balance: number;
  loyalty_level: LoyaltyLevel;
  quarterly_premiums: number;
}

async function buildBalance(client: ReturnType<typeof createClient>, agent: AgentRow) {
  // confirmed commissions
  const { data: confData } = await client
    .from('insurance_commissions')
    .select('amount')
    .eq('agent_id', agent.id)
    .eq('status', 'confirmed');

  const confirmed = (confData ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);

  // pending commissions
  const { data: pendData } = await client
    .from('insurance_commissions')
    .select('amount')
    .eq('agent_id', agent.id)
    .eq('status', 'pending');

  const pending = (pendData ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);

  // выведенное (completed + processing + pending payouts)
  const { data: payData } = await client
    .from('insurance_payouts')
    .select('amount')
    .eq('agent_id', agent.id)
    .in('status', ['completed', 'processing', 'pending']);

  const paidOut = (payData ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);

  const available = Math.max(0, confirmed - paidOut);
  const lvl = agent.loyalty_level as LoyaltyLevel;
  const bonus = LOYALTY_THRESHOLDS[lvl]?.bonus ?? 0;
  const next = nextLevel(lvl);

  return {
    available,
    pending,
    totalEarned: agent.total_earned ?? 0,
    loyaltyLevel: lvl,
    quarterlyPremiums: agent.quarterly_premiums ?? 0,
    loyaltyBonus: bonus,
    nextLevelThreshold: next?.threshold ?? null,
    nextLevelName: next ? LOYALTY_THRESHOLDS[next.level].name : null,
  };
}

function periodStart(period: string): string | null {
  const now = new Date();
  switch (period) {
    case 'month':   return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    case 'quarter': return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString();
    case 'year':    return new Date(now.getFullYear(), 0, 1).toISOString();
    default:        return null; // 'all'
  }
}
