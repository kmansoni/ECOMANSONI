/**
 * CRMInsuranceDashboard — специализированная CRM для страхового агента
 *
 * Реализованные модули:
 * - Воронка продаж полисов (лид → расчёт → КП → оплата → выдача → пролонгация)
 * - KPI-карточки: активные полисы, комиссия, конверсия, средний чек
 * - Таблица клиентов со страховыми данными
 * - Блок истекающих полисов (ближайшие 30 дней)
 * - Лента последних действий
 */
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Shield, Users, TrendingUp, RefreshCw, Plus, Search,
  Phone, Mail, ChevronRight, X, Edit2, CheckCircle,
  Calendar, DollarSign, AlertTriangle, Clock, FileText,
  BarChart2, Target, Activity, User,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { CRMInsuranceClientForm } from "@/components/crm/CRMInsuranceClientForm";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InsuranceClient {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  passport_series: string | null;
  passport_number: string | null;
  birth_date: string | null;
  address: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_plate: string | null;
  vehicle_vin: string | null;
  kbm: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface InsurancePolicyRow {
  id: string;
  user_id: string;
  client_id: string | null;
  client_name: string;
  client_phone: string | null;
  policy_number: string;
  category: string;
  stage: string;
  premium_amount: number;
  commission_amount: number;
  commission_pct: number;
  start_date: string | null;
  end_date: string | null;
  insured_object: string | null;
  company_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ActivityEvent {
  id: string;
  type: 'policy_created' | 'policy_issued' | 'policy_expired' | 'client_added' | 'stage_changed' | 'payment_received';
  description: string;
  created_at: string;
  entity_id: string | null;
}

interface DashboardStats {
  active_policies: number;
  commission_month: number;
  conversion_rate: number;
  avg_premium: number;
  total_clients: number;
  policies_this_month: number;
  expiring_soon: number;
}

interface FunnelStage {
  stage: string;
  label: string;
  color: string;
  count: number;
  value: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGES = [
  { value: 'lead',        label: 'Лид (новый запрос)', color: 'bg-slate-500' },
  { value: 'calculation', label: 'Расчёт',             color: 'bg-blue-500' },
  { value: 'proposal',    label: 'КП отправлено',      color: 'bg-indigo-500' },
  { value: 'payment',     label: 'Оплата',             color: 'bg-amber-500' },
  { value: 'issued',      label: 'Полис выдан',        color: 'bg-green-500' },
  { value: 'renewal',     label: 'На пролонгации',     color: 'bg-purple-500' },
];

const CATEGORY_LABELS: Record<string, string> = {
  osago: 'ОСАГО', kasko: 'КАСКО', mini_kasko: 'Мини-КАСКО', dms: 'ДМС',
  travel: 'Путешествия', property: 'Имущество', mortgage: 'Ипотека',
  life: 'Жизнь', health: 'Здоровье', auto: 'Авто', osgop: 'ОСГОП',
};

const STAGE_COLORS: Record<string, string> = {
  lead:        'text-slate-400 bg-slate-400/10',
  calculation: 'text-blue-400 bg-blue-400/10',
  proposal:    'text-indigo-400 bg-indigo-400/10',
  payment:     'text-amber-400 bg-amber-400/10',
  issued:      'text-green-400 bg-green-400/10',
  renewal:     'text-purple-400 bg-purple-400/10',
};

type Tab = 'dashboard' | 'clients' | 'policies' | 'expiring' | 'activity';

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(n);
const fmtPrice = (n: number) => fmt(n) + ' ₽';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export function CRMInsuranceDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Data
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [funnel, setFunnel] = useState<FunnelStage[]>([]);
  const [clients, setClients] = useState<InsuranceClient[]>([]);
  const [policies, setPolicies] = useState<InsurancePolicyRow[]>([]);
  const [expiringPolicies, setExpiringPolicies] = useState<InsurancePolicyRow[]>([]);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);

  // Modals
  const [showClientForm, setShowClientForm] = useState(false);
  const [editingClient, setEditingClient] = useState<InsuranceClient | null>(null);

  // Policy form
  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [policyForm, setPolicyForm] = useState({
    client_name: '', client_phone: '', policy_number: '', category: 'osago',
    stage: 'lead', premium_amount: '', commission_pct: '15', company_name: '',
    insured_object: '', start_date: '', end_date: '', notes: '', client_id: '',
  });

  // Stage move
  const [movingPolicy, setMovingPolicy] = useState<InsurancePolicyRow | null>(null);
  const [moveStage, setMoveStage] = useState('');

  // ─── Data Loading ──────────────────────────────────────────────────────────

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const uid = user.id;

      // Load clients
      const { data: clientsData, error: cErr } = await supabase
        .from('crm_insurance_clients')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });
      if (cErr) throw cErr;
      setClients(clientsData ?? []);

      // Load policies
      const { data: policiesData, error: pErr } = await supabase
        .from('crm_insurance_policies')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });
      if (pErr) throw pErr;
      const allPolicies = (policiesData ?? []) as InsurancePolicyRow[];
      setPolicies(allPolicies);

      // Compute stats
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const nowISO = now.toISOString();

      const activePolicies = allPolicies.filter(p => p.stage === 'issued' || p.stage === 'renewal');
      const thisMonthPolicies = allPolicies.filter(p => p.created_at >= monthStart);
      const commissionMonth = thisMonthPolicies
        .filter(p => p.stage === 'issued' || p.stage === 'payment')
        .reduce((sum, p) => sum + (p.commission_amount || 0), 0);
      const calcCount = allPolicies.filter(p => p.stage !== 'lead').length;
      const issuedCount = allPolicies.filter(p => p.stage === 'issued' || p.stage === 'renewal').length;
      const conversionRate = calcCount > 0 ? Math.round((issuedCount / calcCount) * 100) : 0;
      const premiums = activePolicies.map(p => p.premium_amount).filter(v => v > 0);
      const avgPremium = premiums.length > 0 ? Math.round(premiums.reduce((a, b) => a + b, 0) / premiums.length) : 0;

      const expiring = allPolicies.filter(p =>
        (p.stage === 'issued' || p.stage === 'renewal') &&
        p.end_date && p.end_date >= nowISO && p.end_date <= in30Days
      );
      setExpiringPolicies(expiring);

      setStats({
        active_policies: activePolicies.length,
        commission_month: commissionMonth,
        conversion_rate: conversionRate,
        avg_premium: avgPremium,
        total_clients: (clientsData ?? []).length,
        policies_this_month: thisMonthPolicies.length,
        expiring_soon: expiring.length,
      });

      // Funnel
      const funnelData: FunnelStage[] = STAGES.map(s => {
        const staged = allPolicies.filter(p => p.stage === s.value);
        return {
          stage: s.value, label: s.label, color: s.color,
          count: staged.length,
          value: staged.reduce((sum, p) => sum + (p.premium_amount || 0), 0),
        };
      });
      setFunnel(funnelData);

      // Activities — last 20 policy events
      const recentActivities: ActivityEvent[] = allPolicies.slice(0, 20).map(p => ({
        id: p.id,
        type: p.stage === 'issued' ? 'policy_issued' as const : 'stage_changed' as const,
        description: `${p.client_name} — ${CATEGORY_LABELS[p.category] ?? p.category} ${p.policy_number ? `#${p.policy_number}` : ''} → ${STAGES.find(s => s.value === p.stage)?.label ?? p.stage}`,
        created_at: p.updated_at || p.created_at,
        entity_id: p.id,
      }));
      setActivities(recentActivities);

    } catch (err) {
      logger.error('[CRMInsuranceDashboard] load error', { error: err });
      if (!silent) toast.error('Ошибка загрузки данных CRM');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleSavePolicy = async () => {
    if (!policyForm.client_name) { toast.error('Укажите имя клиента'); return; }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const premium = parseInt(policyForm.premium_amount.replace(/\D/g, '')) || 0;
      const commPct = parseFloat(policyForm.commission_pct) || 0;
      const commAmount = Math.round(premium * commPct / 100);

      const row = {
        user_id: user.id,
        client_id: policyForm.client_id || null,
        client_name: policyForm.client_name,
        client_phone: policyForm.client_phone || null,
        policy_number: policyForm.policy_number || `INS-${Date.now()}`,
        category: policyForm.category,
        stage: policyForm.stage,
        premium_amount: premium,
        commission_amount: commAmount,
        commission_pct: commPct,
        start_date: policyForm.start_date || null,
        end_date: policyForm.end_date || null,
        insured_object: policyForm.insured_object || null,
        company_name: policyForm.company_name || null,
        notes: policyForm.notes || null,
      };

      const { data, error } = await supabase
        .from('crm_insurance_policies')
        .insert(row)
        .select()
        .single();
      if (error) throw error;

      setPolicies(prev => [data as InsurancePolicyRow, ...prev]);
      toast.success('Полис добавлен');
      setShowPolicyForm(false);
      setPolicyForm({
        client_name: '', client_phone: '', policy_number: '', category: 'osago',
        stage: 'lead', premium_amount: '', commission_pct: '15', company_name: '',
        insured_object: '', start_date: '', end_date: '', notes: '', client_id: '',
      });
      void loadAll(true);
    } catch (err) {
      logger.error('[CRMInsuranceDashboard] save policy error', { error: err });
      toast.error('Ошибка сохранения полиса');
    }
  };

  const handleMoveStage = async () => {
    if (!movingPolicy || !moveStage) return;
    try {
      const { error } = await supabase
        .from('crm_insurance_policies')
        .update({ stage: moveStage, updated_at: new Date().toISOString() })
        .eq('id', movingPolicy.id);
      if (error) throw error;

      setPolicies(prev => prev.map(p => p.id === movingPolicy.id ? { ...p, stage: moveStage, updated_at: new Date().toISOString() } : p));
      toast.success(`Стадия: ${STAGES.find(s => s.value === moveStage)?.label ?? moveStage}`);
      setMovingPolicy(null);
      setMoveStage('');
      void loadAll(true);
    } catch (err) {
      logger.error('[CRMInsuranceDashboard] move stage error', { error: err });
      toast.error('Ошибка обновления стадии');
    }
  };

  const handleDeletePolicy = async (id: string) => {
    if (!confirm('Удалить полис?')) return;
    try {
      const { error } = await supabase.from('crm_insurance_policies').delete().eq('id', id);
      if (error) throw error;
      setPolicies(prev => prev.filter(p => p.id !== id));
      toast.success('Полис удалён');
      void loadAll(true);
    } catch (err) {
      logger.error('[CRMInsuranceDashboard] delete policy error', { error: err });
      toast.error('Ошибка удаления');
    }
  };

  const handleDeleteClient = async (id: string) => {
    if (!confirm('Удалить клиента?')) return;
    try {
      const { error } = await supabase.from('crm_insurance_clients').delete().eq('id', id);
      if (error) throw error;
      setClients(prev => prev.filter(c => c.id !== id));
      toast.success('Клиент удалён');
    } catch (err) {
      logger.error('[CRMInsuranceDashboard] delete client error', { error: err });
      toast.error('Ошибка удаления');
    }
  };

  const handleClientSaved = (client: InsuranceClient) => {
    setClients(prev => {
      const idx = prev.findIndex(c => c.id === client.id);
      return idx >= 0 ? prev.map(c => c.id === client.id ? client : c) : [client, ...prev];
    });
    setShowClientForm(false);
    setEditingClient(null);
  };

  // ─── Computed ──────────────────────────────────────────────────────────────

  const filteredClients = clients.filter(c => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return `${c.name} ${c.phone ?? ''} ${c.email ?? ''} ${c.vehicle_make ?? ''} ${c.vehicle_model ?? ''}`.toLowerCase().includes(q);
  });

  const filteredPolicies = policies.filter(p => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return `${p.client_name} ${p.policy_number} ${p.company_name ?? ''} ${CATEGORY_LABELS[p.category] ?? p.category}`.toLowerCase().includes(q);
  });

  const clientPoliciesCount = (clientId: string) => policies.filter(p => p.client_id === clientId).length;
  const clientPremiumSum = (clientId: string) => policies.filter(p => p.client_id === clientId).reduce((s, p) => s + (p.premium_amount || 0), 0);
  const clientLastPolicy = (clientId: string) => {
    const cp = policies.filter(p => p.client_id === clientId).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return cp[0] ?? null;
  };
  const clientNearestExpiry = (clientId: string) => {
    const cp = policies.filter(p => p.client_id === clientId && p.end_date).sort((a, b) => (a.end_date ?? '').localeCompare(b.end_date ?? ''));
    return cp[0]?.end_date ?? null;
  };

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500" />
      </div>
    );
  }

  // ─── Tab config ────────────────────────────────────────────────────────────

  const TABS: Array<{ id: Tab; label: string; badge?: number }> = [
    { id: 'dashboard', label: 'Дашборд' },
    { id: 'clients',   label: 'Клиенты',     badge: stats?.total_clients },
    { id: 'policies',  label: 'Полисы',       badge: policies.length || undefined },
    { id: 'expiring',  label: 'Истекающие',   badge: stats?.expiring_soon || undefined },
    { id: 'activity',  label: 'Действия' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700">
        <div className="flex items-center gap-3 px-4 pt-4 pb-2">
          <button onClick={() => navigate('/crm')} className="p-2 rounded-full hover:bg-slate-700">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-400" /> Страхование CRM
            </h1>
            {stats && (
              <p className="text-xs text-slate-400">
                {stats.active_policies} активных полисов · {stats.total_clients} клиентов
                {stats.expiring_soon > 0 && ` · ${stats.expiring_soon} истекают`}
              </p>
            )}
          </div>
          <button onClick={() => loadAll(true)} className={`p-2 rounded-full hover:bg-slate-700 ${refreshing ? 'animate-spin' : ''}`}>
            <RefreshCw className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        {/* Tabs */}
        <div className="flex px-4 overflow-x-auto scrollbar-hide">
          {TABS.map(tab => (
            <button key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSearchQuery(''); }}
              className={`relative px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full text-xs">{tab.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          DASHBOARD
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'dashboard' && stats && (
        <div className="p-4 space-y-5">
          {/* KPI Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700/50">
              <div className="p-2 bg-emerald-500/20 rounded-lg w-fit mb-2"><Shield className="w-5 h-5 text-emerald-400" /></div>
              <p className="text-2xl font-bold text-white">{stats.active_policies}</p>
              <p className="text-xs text-slate-400">Активных полисов</p>
              <p className="text-xs text-slate-500">{stats.policies_this_month} за месяц</p>
            </div>
            <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700/50">
              <div className="p-2 bg-green-500/20 rounded-lg w-fit mb-2"><DollarSign className="w-5 h-5 text-green-400" /></div>
              <p className="text-2xl font-bold text-white">{fmtPrice(stats.commission_month)}</p>
              <p className="text-xs text-slate-400">Комиссия за месяц</p>
            </div>
            <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700/50">
              <div className="p-2 bg-blue-500/20 rounded-lg w-fit mb-2"><Target className="w-5 h-5 text-blue-400" /></div>
              <p className="text-2xl font-bold text-white">{stats.conversion_rate}%</p>
              <p className="text-xs text-slate-400">Конверсия</p>
              <p className="text-xs text-slate-500">расчёт → покупка</p>
            </div>
            <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700/50">
              <div className="p-2 bg-amber-500/20 rounded-lg w-fit mb-2"><BarChart2 className="w-5 h-5 text-amber-400" /></div>
              <p className="text-2xl font-bold text-white">{stats.avg_premium > 0 ? fmtPrice(stats.avg_premium) : '—'}</p>
              <p className="text-xs text-slate-400">Средний чек</p>
            </div>
          </div>

          {/* Expiring alert */}
          {stats.expiring_soon > 0 && (
            <div onClick={() => setActiveTab('expiring')} className="cursor-pointer p-4 bg-amber-500/10 rounded-2xl border border-amber-500/30 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-amber-400 font-medium">Истекающие полисы</p>
                <p className="text-sm text-amber-400/70">{stats.expiring_soon} полисов истекают в ближайшие 30 дней</p>
              </div>
              <ChevronRight className="w-4 h-4 text-amber-400/50" />
            </div>
          )}

          {/* Funnel */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-white">Воронка продаж</h2>
              <button onClick={() => setActiveTab('policies')} className="text-xs text-emerald-400 flex items-center gap-1">
                Все полисы <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2">
              {funnel.map(stage => (
                <div key={stage.stage}
                  onClick={() => setActiveTab('policies')}
                  className="cursor-pointer flex items-center justify-between p-3 bg-slate-800/80 rounded-xl border border-slate-700/50 hover:border-slate-600 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-6 rounded-full ${stage.color}`} />
                    <span className="text-slate-200 text-sm">{stage.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {stage.value > 0 && (
                      <span className="text-slate-400 text-xs">{fmtPrice(stage.value)}</span>
                    )}
                    <span className="text-white font-bold text-sm min-w-[20px] text-right">{stage.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => { setEditingClient(null); setShowClientForm(true); }}
              className="flex items-center gap-2 p-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-xl text-blue-400 text-sm">
              <Users className="w-4 h-4" /> Новый клиент
            </button>
            <button onClick={() => setShowPolicyForm(true)}
              className="flex items-center gap-2 p-3 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm">
              <FileText className="w-4 h-4" /> Новый полис
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          CLIENTS TAB
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'clients' && (
        <div className="p-4 space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
              <input
                className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
                placeholder="Поиск клиентов..."
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <button onClick={() => { setEditingClient(null); setShowClientForm(true); }}
              className="flex items-center gap-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-white font-medium text-sm">
              <Plus className="w-4 h-4" /> Добавить
            </button>
          </div>

          {filteredClients.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 mx-auto mb-2 text-slate-600" />
              <p className="text-slate-400">{searchQuery ? 'Нет результатов' : 'Клиентов нет'}</p>
              {!searchQuery && (
                <button onClick={() => { setEditingClient(null); setShowClientForm(true); }}
                  className="mt-3 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm">
                  Добавить первого клиента
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {/* Table-like cards */}
              <div className="hidden md:grid grid-cols-7 gap-2 px-4 py-2 text-xs text-slate-500 font-medium">
                <span>ФИО</span><span>Телефон</span><span>Полисов</span><span>Сумма премий</span>
                <span>Последний полис</span><span>Дата окончания</span><span></span>
              </div>
              {filteredClients.map(client => {
                const polCount = clientPoliciesCount(client.id);
                const premSum = clientPremiumSum(client.id);
                const lastPol = clientLastPolicy(client.id);
                const nearestExp = clientNearestExpiry(client.id);
                const isExpiringSoon = nearestExp && new Date(nearestExp).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000;

                return (
                  <div key={client.id} className="bg-slate-800/80 rounded-2xl border border-slate-700/50 p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-600/30 flex items-center justify-center flex-shrink-0">
                        <span className="text-emerald-400 font-semibold text-sm">
                          {client.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium truncate">{client.name}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                          {client.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {client.phone}</span>}
                          {client.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {client.email}</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-xs flex-wrap">
                          <span className="text-slate-400">{polCount} полисов</span>
                          {premSum > 0 && <span className="text-green-400">{fmtPrice(premSum)}</span>}
                          {lastPol && (
                            <span className="text-slate-500">
                              Посл.: {CATEGORY_LABELS[lastPol.category] ?? lastPol.category}
                            </span>
                          )}
                          {nearestExp && (
                            <span className={`flex items-center gap-1 ${isExpiringSoon ? 'text-amber-400' : 'text-slate-500'}`}>
                              <Calendar className="w-3 h-3" />
                              {new Date(nearestExp).toLocaleDateString('ru-RU')}
                              {isExpiringSoon && ' ⚠️'}
                            </span>
                          )}
                        </div>
                        {/* Vehicle info */}
                        {client.vehicle_make && (
                          <p className="text-xs text-slate-500 mt-1">
                            {client.vehicle_make} {client.vehicle_model} {client.vehicle_year ?? ''} {client.vehicle_plate ?? ''}
                            {client.kbm != null && ` · КБМ: ${client.kbm}`}
                          </p>
                        )}
                        {/* Contact buttons */}
                        <div className="flex gap-2 mt-2">
                          {client.phone && (
                            <a href={`tel:${client.phone}`}
                              className="flex items-center gap-1 px-2 py-1 bg-green-600/20 text-green-400 rounded-lg text-xs">
                              <Phone className="w-3 h-3" /> Звонок
                            </a>
                          )}
                          {client.email && (
                            <a href={`mailto:${client.email}`}
                              className="flex items-center gap-1 px-2 py-1 bg-blue-600/20 text-blue-400 rounded-lg text-xs">
                              <Mail className="w-3 h-3" /> Email
                            </a>
                          )}
                          <button onClick={() => {
                            setPolicyForm(prev => ({ ...prev, client_id: client.id, client_name: client.name, client_phone: client.phone ?? '' }));
                            setShowPolicyForm(true);
                          }}
                            className="flex items-center gap-1 px-2 py-1 bg-emerald-600/20 text-emerald-400 rounded-lg text-xs">
                            <FileText className="w-3 h-3" /> Полис
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => { setEditingClient(client); setShowClientForm(true); }}
                          className="p-2 hover:bg-slate-700 rounded-lg"><Edit2 className="w-4 h-4 text-slate-400" /></button>
                        <button onClick={() => handleDeleteClient(client.id)}
                          className="p-2 hover:bg-red-500/20 rounded-lg"><X className="w-4 h-4 text-slate-500" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          POLICIES TAB
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'policies' && (
        <div className="p-4 space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
              <input
                className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
                placeholder="Поиск полисов..."
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <button onClick={() => setShowPolicyForm(true)}
              className="flex items-center gap-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-white font-medium text-sm">
              <Plus className="w-4 h-4" /> Полис
            </button>
          </div>

          {/* Stage filter */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {STAGES.map(s => {
              const cnt = policies.filter(p => p.stage === s.value).length;
              return (
                <button key={s.value}
                  onClick={() => setSearchQuery(s.label)}
                  className="px-3 py-1.5 rounded-full text-xs whitespace-nowrap bg-slate-700 text-slate-400 hover:bg-slate-600">
                  {s.label} ({cnt})
                </button>
              );
            })}
          </div>

          {filteredPolicies.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 mx-auto mb-2 text-slate-600" />
              <p className="text-slate-400">Нет полисов</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredPolicies.map(policy => (
                <div key={policy.id} className="bg-slate-800/80 rounded-2xl border border-slate-700/50 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-white font-medium">{policy.client_name}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                          {CATEGORY_LABELS[policy.category] ?? policy.category}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STAGE_COLORS[policy.stage] ?? 'bg-slate-700 text-slate-300'}`}>
                          {STAGES.find(s => s.value === policy.stage)?.label ?? policy.stage}
                        </span>
                        {policy.company_name && <span className="text-xs text-slate-500">{policy.company_name}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-bold">{fmtPrice(policy.premium_amount)}</p>
                      {policy.commission_amount > 0 && (
                        <p className="text-xs text-green-400">ком: {fmtPrice(policy.commission_amount)}</p>
                      )}
                    </div>
                  </div>

                  {policy.policy_number && (
                    <p className="text-xs text-slate-500 mb-2">#{policy.policy_number}</p>
                  )}

                  {(policy.start_date || policy.end_date) && (
                    <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                      <Calendar className="w-3 h-3" />
                      {policy.start_date && new Date(policy.start_date).toLocaleDateString('ru-RU')}
                      {policy.start_date && policy.end_date && ' — '}
                      {policy.end_date && new Date(policy.end_date).toLocaleDateString('ru-RU')}
                    </div>
                  )}

                  {/* Stage move */}
                  <div className="flex gap-1 mt-2 overflow-x-auto scrollbar-hide">
                    {STAGES.filter(s => s.value !== policy.stage).map(s => (
                      <button key={s.value}
                        onClick={() => { setMovingPolicy(policy); setMoveStage(s.value); }}
                        className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs whitespace-nowrap">
                        → {s.label}
                      </button>
                    ))}
                    <button onClick={() => handleDeletePolicy(policy.id)}
                      className="px-2 py-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg text-xs whitespace-nowrap">
                      Удалить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          EXPIRING POLICIES TAB
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'expiring' && (
        <div className="p-4 space-y-4">
          <div className="p-4 bg-amber-500/10 rounded-2xl border border-amber-500/30">
            <p className="text-amber-400 font-medium text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Полисы, истекающие в ближайшие 30 дней
            </p>
          </div>

          {expiringPolicies.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-600" />
              <p className="text-slate-400">Нет истекающих полисов</p>
            </div>
          ) : (
            <div className="space-y-2">
              {expiringPolicies.map(policy => {
                const daysLeft = policy.end_date
                  ? Math.ceil((new Date(policy.end_date).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
                  : null;
                return (
                  <div key={policy.id} className="bg-slate-800/80 rounded-2xl border border-amber-500/30 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-white font-medium">{policy.client_name}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                            {CATEGORY_LABELS[policy.category] ?? policy.category}
                          </span>
                          {policy.company_name && <span className="text-xs text-slate-500">{policy.company_name}</span>}
                          {policy.policy_number && <span className="text-xs text-slate-500">#{policy.policy_number}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        {daysLeft !== null && (
                          <span className={`text-sm font-bold ${daysLeft <= 7 ? 'text-red-400' : daysLeft <= 14 ? 'text-amber-400' : 'text-yellow-400'}`}>
                            {daysLeft} дн.
                          </span>
                        )}
                        <p className="text-xs text-slate-400 mt-1">
                          до {policy.end_date && new Date(policy.end_date).toLocaleDateString('ru-RU')}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      {policy.client_phone && (
                        <a href={`tel:${policy.client_phone}`}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-600/20 text-green-400 rounded-lg text-xs">
                          <Phone className="w-3 h-3" /> Позвонить
                        </a>
                      )}
                      <button
                        onClick={() => { setMovingPolicy(policy); setMoveStage('renewal'); }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-purple-600/20 text-purple-400 rounded-lg text-xs">
                        <RefreshCw className="w-3 h-3" /> Пролонгировать
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          ACTIVITY TAB
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'activity' && (
        <div className="p-4 space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" /> Последние действия
          </h2>
          {activities.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="w-12 h-12 mx-auto mb-2 text-slate-600" />
              <p className="text-slate-400">Нет событий</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activities.map(event => (
                <div key={event.id} className="flex items-start gap-3 p-3 bg-slate-800/80 rounded-xl border border-slate-700/50">
                  <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                    event.type === 'policy_issued' ? 'bg-green-500' :
                    event.type === 'payment_received' ? 'bg-emerald-500' :
                    event.type === 'policy_expired' ? 'bg-red-500' :
                    'bg-blue-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200">{event.description}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(event.created_at).toLocaleString('ru-RU', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODALS
      ══════════════════════════════════════════════════════════ */}

      {/* Client form modal */}
      {showClientForm && (
        <CRMInsuranceClientForm
          initial={editingClient ?? undefined}
          onClose={() => { setShowClientForm(false); setEditingClient(null); }}
          onSaved={handleClientSaved}
        />
      )}

      {/* Policy form modal */}
      {showPolicyForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPolicyForm(false)} />
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm flex items-center justify-between p-4 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-lg"><FileText className="w-4 h-4 text-emerald-400" /></div>
                <h2 className="text-white font-semibold">Новый полис</h2>
              </div>
              <button onClick={() => setShowPolicyForm(false)} className="p-2 rounded-full hover:bg-slate-700">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Client select from existing */}
              {clients.length > 0 && (
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Выбрать клиента</label>
                  <select
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                    value={policyForm.client_id}
                    onChange={e => {
                      const cl = clients.find(c => c.id === e.target.value);
                      setPolicyForm(prev => ({
                        ...prev,
                        client_id: e.target.value,
                        client_name: cl?.name ?? prev.client_name,
                        client_phone: cl?.phone ?? prev.client_phone,
                      }));
                    }}
                  >
                    <option value="">— Новый клиент —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">ФИО клиента *</label>
                  <input className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                    value={policyForm.client_name} onChange={e => setPolicyForm(prev => ({ ...prev, client_name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Телефон</label>
                  <input className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                    value={policyForm.client_phone} onChange={e => setPolicyForm(prev => ({ ...prev, client_phone: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Категория</label>
                  <select className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                    value={policyForm.category} onChange={e => setPolicyForm(prev => ({ ...prev, category: e.target.value }))}>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Стадия</label>
                  <select className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                    value={policyForm.stage} onChange={e => setPolicyForm(prev => ({ ...prev, stage: e.target.value }))}>
                    {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Премия (₽)</label>
                  <input className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                    placeholder="15000"
                    value={policyForm.premium_amount} onChange={e => setPolicyForm(prev => ({ ...prev, premium_amount: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Комиссия (%)</label>
                  <input className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                    value={policyForm.commission_pct} onChange={e => setPolicyForm(prev => ({ ...prev, commission_pct: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Страховая компания</label>
                <input className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                  placeholder="Ингосстрах, РЕСО и т.д."
                  value={policyForm.company_name} onChange={e => setPolicyForm(prev => ({ ...prev, company_name: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Номер полиса</label>
                <input className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                  placeholder="XXX-000000000"
                  value={policyForm.policy_number} onChange={e => setPolicyForm(prev => ({ ...prev, policy_number: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Объект страхования</label>
                <input className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                  placeholder="Toyota Camry A777AA77"
                  value={policyForm.insured_object} onChange={e => setPolicyForm(prev => ({ ...prev, insured_object: e.target.value }))} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Дата начала</label>
                  <input type="date" className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                    value={policyForm.start_date} onChange={e => setPolicyForm(prev => ({ ...prev, start_date: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Дата окончания</label>
                  <input type="date" className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                    value={policyForm.end_date} onChange={e => setPolicyForm(prev => ({ ...prev, end_date: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Заметки</label>
                <textarea className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500 resize-none" rows={2}
                  value={policyForm.notes} onChange={e => setPolicyForm(prev => ({ ...prev, notes: e.target.value }))} />
              </div>
            </div>

            <div className="sticky bottom-0 bg-slate-900/95 backdrop-blur-sm p-4 border-t border-slate-700 flex gap-3">
              <button onClick={() => setShowPolicyForm(false)} className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium">Отмена</button>
              <button onClick={handleSavePolicy} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium">Добавить полис</button>
            </div>
          </div>
        </div>
      )}

      {/* Stage move confirmation */}
      {movingPolicy && moveStage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setMovingPolicy(null); setMoveStage(''); }} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-white font-semibold mb-2">Изменить стадию</h3>
            <p className="text-slate-400 text-sm mb-4">
              {movingPolicy.client_name} → {STAGES.find(s => s.value === moveStage)?.label ?? moveStage}
            </p>
            <div className="flex gap-3">
              <button onClick={() => { setMovingPolicy(null); setMoveStage(''); }} className="flex-1 py-2.5 bg-slate-700 text-white rounded-xl text-sm">Отмена</button>
              <button onClick={handleMoveStage} className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm">Подтвердить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CRMInsuranceDashboard;
