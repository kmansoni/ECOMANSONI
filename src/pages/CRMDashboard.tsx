/**
 * CRMDashboard — полнофункциональная CRM с модулями:
 * - Дашборд: KPI карточки, воронка продаж, аналитика источников, конверсия
 * - Клиенты: список с поиском, CRUD, теги, связь с чатом
 * - Сделки: Kanban-board по стадиям, быстрый переход между стадиями, CRUD
 * - Задачи: список с приоритетами, дедлайнами, статусами, CRUD
 * - Объекты (RE): каталог объектов недвижимости, фильтры, карточки
 * - Просмотры: расписание показов, результаты
 *
 * Сравнение реализованных функций:
 * ✓ Bitrix24: воронка Kanban, карточки сделок, задачи, источники лидов, активность
 * ✓ TopN Lab: база объектов, подбор под требования, просмотры
 * ✓ ReBPM: кастомные стадии, ипотека, комиссия, документы
 * ✓ Follow Up Boss: быстрый контакт (звонок/SMS/email прямо из карточки)
 * ✓ Salesforce RE Cloud: источники лидов, конверсия, pipeline value
 */
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Users, Briefcase, CheckCircle, Clock, TrendingUp, Plus,
  UserPlus, DollarSign, Calendar, MoreVertical, Phone, Mail, MessageSquare,
  Home, Eye, Search, Filter, ChevronRight, X, Star, AlertTriangle,
  BarChart2, Target, Building2, MapPin, Edit2, Trash2, Check, RefreshCw,
} from "lucide-react";
import {
  crm,
  type DashboardStats, type PipelineStage, type Profession,
  type CRMClientRecord, type CRMDeal, type CRMTask, type CRMProperty,
  type CRMShowing,
  DEAL_SOURCES,
} from "@/lib/crm";
import { CRMClientForm } from "@/components/crm/CRMClientForm";
import { CRMDealForm } from "@/components/crm/CRMDealForm";
import { CRMPropertyForm } from "@/components/crm/CRMPropertyForm";
import { logger } from "@/lib/logger";

// ─── Constants ───────────────────────────────────────────────────────────────

const PROFESSION_NAMES: Record<string, string> = {
  default: 'Универсальная CRM', auto: 'Авто бизнес', realestate: 'Недвижимость',
  hr: 'HR / Рекрутинг', smm: 'SMM / Маркетинг', finance: 'Финансы',
  medicine: 'Медицина', education: 'Образование', beauty: 'Салоны красоты',
  restaurant: 'Ресторан', tourism: 'Туризм', retail: 'Розница',
  logistics: 'Логистика', hotel: 'Отель', entertainment: 'Events',
  fitness: 'Фитнес', construction: 'Строительство', insurance: 'Страхование',
};

const RE_STAGES = [
  { value: 'new',         label: 'Новые',        color: 'bg-slate-600' },
  { value: 'contacted',   label: 'Контакт',      color: 'bg-blue-600' },
  { value: 'qualified',   label: 'Qualification', color: 'bg-indigo-600' },
  { value: 'viewing',     label: 'Просмотры',    color: 'bg-purple-600' },
  { value: 'negotiation', label: 'Переговоры',   color: 'bg-amber-600' },
  { value: 'contract',    label: 'Договор',      color: 'bg-orange-600' },
  { value: 'won',         label: 'Закрыто ✓',    color: 'bg-green-600' },
  { value: 'lost',        label: 'Отказ ✗',      color: 'bg-red-600' },
];

const DEFAULT_STAGES = [
  { value: 'new',         label: 'Новые',        color: 'bg-slate-600' },
  { value: 'contacted',   label: 'Контакт',      color: 'bg-blue-600' },
  { value: 'qualified',   label: 'Квалификация', color: 'bg-indigo-600' },
  { value: 'proposal',    label: 'Предложение',  color: 'bg-purple-600' },
  { value: 'negotiation', label: 'Переговоры',   color: 'bg-amber-600' },
  { value: 'won',         label: 'Выиграно ✓',   color: 'bg-green-600' },
  { value: 'lost',        label: 'Проиграно ✗',  color: 'bg-red-600' },
];

const STAGE_NAMES: Record<string, string> = {
  new: 'Новый', contacted: 'Контакт', qualified: 'Квалификация',
  proposal: 'Предложение', negotiation: 'Переговоры', won: 'Выиграно',
  lost: 'Проиграно', viewing: 'Просмотр', contract: 'Договор',
  test_drive: 'Тест-драйв', credit_approval: 'Кредит', deal: 'Сделка',
  completed: 'Завершено', screening: 'Скрининг', interview: 'Интервью',
  offer: 'Оффер', hired: 'Нанят', rejected: 'Отказ',
};

const PROPERTY_TYPE_ICONS: Record<string, string> = {
  apartment: '🏢', room: '🚪', house: '🏠', townhouse: '🏡',
  commercial: '🏬', land: '🌳', garage: '🅿️', parking: '🅿️',
};

const PROPERTY_STATUS_COLORS: Record<string, string> = {
  available: 'text-green-400 bg-green-400/10',
  reserved:  'text-yellow-400 bg-yellow-400/10',
  sold:      'text-red-400 bg-red-400/10',
  rented:    'text-purple-400 bg-purple-400/10',
  off_market:'text-slate-400 bg-slate-400/10',
};

const PROPERTY_STATUS_LABELS: Record<string, string> = {
  available: 'Свободен', reserved: 'Резерв', sold: 'Продан',
  rented: 'Сдан', off_market: 'Снят',
};

// Tab definition
type Tab = 'dashboard' | 'clients' | 'deals' | 'tasks' | 'properties' | 'showings';

// ─── Main component ───────────────────────────────────────────────────────────

export function CRMDashboard() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const profession = (searchParams.get('profession') || 'default') as Profession;

  // Global state
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Data state
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [pipeline, setPipeline] = useState<PipelineStage[]>([]);
  const [clients, setClients] = useState<CRMClientRecord[]>([]);
  const [deals, setDeals] = useState<CRMDeal[]>([]);
  const [tasks, setTasks] = useState<CRMTask[]>([]);
  const [properties, setProperties] = useState<CRMProperty[]>([]);
  const [showings, setShowings] = useState<CRMShowing[]>([]);

  // Modals
  const [showClientForm, setShowClientForm] = useState(false);
  const [editingClient, setEditingClient] = useState<CRMClientRecord | null>(null);
  const [showDealForm, setShowDealForm] = useState(false);
  const [editingDeal, setEditingDeal] = useState<CRMDeal | null>(null);
  const [showPropertyForm, setShowPropertyForm] = useState(false);
  const [editingProperty, setEditingProperty] = useState<CRMProperty | null>(null);

  // Task editing
  const [editingTask, setEditingTask] = useState<CRMTask | null>(null);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', priority: 'medium' as 'low'|'medium'|'high', due_date: '', client_id: '' });

  // Deal kanban filter
  const [kanbanStage, setKanbanStage] = useState<string | null>(null);

  const STAGES = profession === 'realestate' ? RE_STAGES : DEFAULT_STAGES;

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      crm.setProfession(profession);
      const [statsData, pipelineData, clientsData, dealsData, tasksData] = await Promise.all([
        crm.getDashboardStatsV2(),
        crm.getPipeline(),
        crm.getClients(),
        crm.getDeals(),
        crm.getTasks(),
      ]);
      setStats(statsData);
      setPipeline(pipelineData);
      setClients(clientsData);
      setDeals(dealsData);
      setTasks(tasksData);

      if (profession === 'realestate') {
        const [props, shows] = await Promise.all([crm.getProperties(), crm.getShowings()]);
        setProperties(props);
        setShowings(shows);
      }
    } catch (err) {
      logger.error('[CRMDashboard] CRM load error', { error: err, profession });
      if (!silent) toast.error('Ошибка загрузки CRM');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profession]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleDeleteClient = async (id: string) => {
    if (!confirm('Удалить клиента?')) return;
    try {
      await crm.deleteClient(id);
      setClients(prev => prev.filter(c => c.id !== id));
      toast.success('Клиент удалён');
    } catch (error) {
      logger.warn('[CRMDashboard] Failed to delete client', { error, id });
      toast.error('Ошибка удаления');
    }
  };

  const handleDeleteDeal = async (id: string) => {
    if (!confirm('Удалить сделку?')) return;
    try {
      await crm.deleteDeal(id);
      setDeals(prev => prev.filter(d => d.id !== id));
      toast.success('Сделка удалена');
    } catch (error) {
      logger.warn('[CRMDashboard] Failed to delete deal', { error, id });
      toast.error('Ошибка удаления');
    }
  };

  const handleMoveDeal = async (dealId: string, newStage: string) => {
    try {
      const updated = await crm.updateDeal(dealId, {
        stage: newStage,
        won:   newStage === 'won',
        lost:  newStage === 'lost',
      });
      setDeals(prev => prev.map(d => d.id === dealId ? updated : d));
      toast.success(`Сделка перемещена: ${STAGE_NAMES[newStage] ?? newStage}`);
    } catch (error) {
      logger.warn('[CRMDashboard] Failed to move deal', { error, dealId, newStage });
      toast.error('Ошибка обновления сделки');
    }
  };

  const handleCompleteTask = async (id: string) => {
    try {
      const updated = await crm.completeTask(id);
      setTasks(prev => prev.map(t => t.id === id ? updated : t));
      toast.success('Задача выполнена ✓');
    } catch (error) {
      logger.warn('[CRMDashboard] Failed to complete task', { error, id });
      toast.error('Ошибка обновления задачи');
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!confirm('Удалить задачу?')) return;
    try {
      await crm.deleteTask(id);
      setTasks(prev => prev.filter(t => t.id !== id));
      toast.success('Задача удалена');
    } catch (error) {
      logger.warn('[CRMDashboard] Failed to delete task', { error, id });
      toast.error('Ошибка удаления');
    }
  };

  const handleSaveTask = async () => {
    if (!taskForm.title.trim()) { toast.error('Укажите название задачи'); return; }
    try {
      if (editingTask) {
        const updated = await crm.updateTask(editingTask.id, {
          title: taskForm.title,
          priority: taskForm.priority,
          due_date: taskForm.due_date || null,
          client_id: taskForm.client_id || null,
        });
        setTasks(prev => prev.map(t => t.id === editingTask.id ? updated : t));
        toast.success('Задача обновлена');
      } else {
        const created = await crm.createTask({
          title: taskForm.title,
          priority: taskForm.priority,
          due_date: taskForm.due_date || null,
          client_id: taskForm.client_id || null,
          status: 'pending',
          profession,
        });
        setTasks(prev => [created, ...prev]);
        toast.success('Задача создана');
      }
      setTaskFormOpen(false);
      setEditingTask(null);
      setTaskForm({ title: '', priority: 'medium', due_date: '', client_id: '' });
    } catch (error) {
      logger.warn('[CRMDashboard] Failed to save task', { error, editingTaskId: editingTask?.id ?? null });
      toast.error('Ошибка сохранения задачи');
    }
  };

  const handleDeleteProperty = async (id: string) => {
    if (!confirm('Удалить объект?')) return;
    try {
      await crm.deleteProperty(id);
      setProperties(prev => prev.filter(p => p.id !== id));
      toast.success('Объект удалён');
    } catch (error) {
      logger.warn('[CRMDashboard] Failed to delete property', { error, id });
      toast.error('Ошибка удаления');
    }
  };

  // ─── Computed ──────────────────────────────────────────────────────────────

  const filteredClients = clients.filter(c =>
    !searchQuery ||
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone?.includes(searchQuery) ||
    c.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDeals = deals.filter(d =>
    !kanbanStage ? true : d.stage === kanbanStage
  );

  const filteredProperties = properties.filter(p =>
    !searchQuery ||
    p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.district?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const overdueTasks = tasks.filter(t =>
    t.status !== 'completed' && t.status !== 'cancelled' &&
    t.due_date && new Date(t.due_date) < new Date()
  );

  const todayShowings = showings.filter(s => {
    const d = new Date(s.scheduled_at);
    const now = new Date();
    return d.toDateString() === now.toDateString() && s.status === 'scheduled';
  });

  const getClientName = (id: string | null) => clients.find(c => c.id === id)?.name ?? '—';
  const getPropertyTitle = (id: string | null) => properties.find(p => p.id === id)?.title ?? '—';

  const dealsByStage = STAGES.reduce((acc, s) => {
    acc[s.value] = deals.filter(d => d.stage === s.value);
    return acc;
  }, {} as Record<string, CRMDeal[]>);

  const sourceLabel = (src: string) =>
    DEAL_SOURCES.find(s => s.value === src)?.label ?? src;

  // ─── Render helpers ────────────────────────────────────────────────────────

  const StatCard = ({ icon: Icon, value, label, color, sub }: {
    icon: React.ElementType; value: string | number; label: string; color: string; sub?: string;
  }) => (
    <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700/50">
      <div className="flex items-center gap-3">
        <div className={`p-2 ${color} rounded-lg`}><Icon className="w-5 h-5" /></div>
        <div className="min-w-0">
          <p className="text-2xl font-bold text-white leading-tight">{value}</p>
          <p className="text-xs text-slate-400 truncate">{label}</p>
          {sub && <p className="text-xs text-slate-500">{sub}</p>}
        </div>
      </div>
    </div>
  );

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }

  // ─── Tabs config ───────────────────────────────────────────────────────────

  const TABS: Array<{ id: Tab; label: string; badge?: number }> = [
    { id: 'dashboard',   label: 'Дашборд' },
    { id: 'clients',     label: 'Клиенты', badge: stats?.total_clients },
    { id: 'deals',       label: 'Сделки',  badge: stats?.active_deals },
    { id: 'tasks',       label: 'Задачи',  badge: overdueTasks.length || undefined },
    ...(profession === 'realestate' ? [
      { id: 'properties' as Tab, label: 'Объекты', badge: stats?.available_properties },
      { id: 'showings' as Tab,   label: 'Просмотры', badge: todayShowings.length || undefined },
    ] : []),
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 pb-24">
      {/* ── Header ── */}
      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700">
        <div className="flex items-center gap-3 px-4 pt-4 pb-2">
          <button onClick={() => navigate('/crm')} className="p-2 rounded-full hover:bg-slate-700">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white leading-tight">
              {PROFESSION_NAMES[profession] ?? 'CRM'}
            </h1>
            {stats && (
              <p className="text-xs text-slate-400">
                {stats.active_deals} сделок · {stats.total_clients} клиентов
                {stats.conversion_rate > 0 && ` · ${stats.conversion_rate}% конверсия`}
              </p>
            )}
          </div>
          <button
            onClick={() => loadAll(true)}
            className={`p-2 rounded-full hover:bg-slate-700 transition-colors ${refreshing ? 'animate-spin' : ''}`}
          >
            <RefreshCw className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-4 gap-0 overflow-x-auto scrollbar-hide">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSearchQuery(''); }}
              className={`relative px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold ${
                  tab.id === 'tasks' ? 'bg-red-500/30 text-red-400' : 'bg-slate-700 text-slate-300'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          DASHBOARD TAB
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'dashboard' && stats && (
        <div className="p-4 space-y-6">
          {/* KPI Grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={Users}       value={stats.total_clients}    label="Клиентов"         color="bg-blue-500/20 text-blue-400"    sub={`+${stats.new_clients_this_month} за месяц`} />
            <StatCard icon={Briefcase}   value={stats.active_deals}     label="Активных сделок"  color="bg-green-500/20 text-green-400"   sub={stats.active_deals_value > 0 ? `${(stats.active_deals_value/1_000_000).toFixed(1)}M ₽` : undefined} />
            <StatCard icon={TrendingUp}  value={`${stats.conversion_rate}%`} label="Конверсия 90д" color="bg-emerald-500/20 text-emerald-400" sub={`${stats.won_deals} из ${stats.won_deals + stats.lost_deals} сделок`} />
            <StatCard icon={Clock}       value={stats.pending_tasks}    label="Задач"            color="bg-purple-500/20 text-purple-400" sub={overdueTasks.length > 0 ? `⚠️ ${overdueTasks.length} просрочено` : undefined} />
            {profession === 'realestate' && (
              <>
                <StatCard icon={Home}    value={stats.available_properties} label="Объектов" color="bg-orange-500/20 text-orange-400" />
                <StatCard icon={Eye}     value={stats.showings_this_week}   label="Просмотров/нед" color="bg-cyan-500/20 text-cyan-400" sub={`${stats.showings_today} сегодня`} />
              </>
            )}
          </div>

          {/* Revenue block */}
          {stats.total_deals_value > 0 && (
            <div className="p-4 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-2xl border border-green-500/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-green-400/70">💰 Закрытые сделки</p>
                  <p className="text-2xl font-bold text-green-400">{(stats.total_deals_value/1_000_000).toFixed(2)} M ₽</p>
                  {profession === 'realestate' && stats.commission_earned > 0 && (
                    <p className="text-sm text-green-400/70 mt-0.5">
                      Комиссия: {stats.commission_earned.toLocaleString()} ₽
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">В работе</p>
                  <p className="text-xl font-bold text-blue-400">{(stats.pipeline_value/1_000_000).toFixed(2)} M ₽</p>
                </div>
              </div>
            </div>
          )}

          {/* Overdue alert */}
          {overdueTasks.length > 0 && (
            <div onClick={() => setActiveTab('tasks')} className="cursor-pointer p-4 bg-red-500/10 rounded-2xl border border-red-500/30 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-red-400 font-medium">Просроченные задачи</p>
                <p className="text-sm text-red-400/70">{overdueTasks.length} задач требуют внимания</p>
              </div>
              <ChevronRight className="w-4 h-4 text-red-400/50" />
            </div>
          )}

          {/* Today's showings alert */}
          {todayShowings.length > 0 && (
            <div onClick={() => setActiveTab('showings')} className="cursor-pointer p-4 bg-cyan-500/10 rounded-2xl border border-cyan-500/30 flex items-center gap-3">
              <Eye className="w-5 h-5 text-cyan-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-cyan-400 font-medium">Показы сегодня</p>
                <p className="text-sm text-cyan-400/70">{todayShowings.length} запланированных просмотров</p>
              </div>
              <ChevronRight className="w-4 h-4 text-cyan-400/50" />
            </div>
          )}

          {/* Pipeline */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-white">Воронка продаж</h2>
              <button onClick={() => setActiveTab('deals')} className="text-xs text-blue-400 flex items-center gap-1">
                Все сделки <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2">
              {pipeline.map((stage) => {
                const stageConf = STAGES.find(s => s.value === stage.stage);
                return (
                  <div key={stage.stage}
                    onClick={() => { setActiveTab('deals'); setKanbanStage(stage.stage); }}
                    className="cursor-pointer flex items-center justify-between p-3 bg-slate-800/80 rounded-xl border border-slate-700/50 hover:border-slate-600 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-6 rounded-full ${
                        stage.stage === 'won' ? 'bg-green-500' :
                        stage.stage === 'lost' ? 'bg-red-500' :
                        stageConf?.color.replace('bg-', 'bg-') ?? 'bg-blue-500'
                      }`} />
                      <span className="text-slate-200 text-sm">{STAGE_NAMES[stage.stage] ?? stage.stage}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {stage.total_value > 0 && (
                        <span className="text-slate-400 text-xs">{(stage.total_value/1_000_000).toFixed(1)}M</span>
                      )}
                      <span className="text-white font-bold text-sm min-w-[20px] text-right">{stage.count}</span>
                    </div>
                  </div>
                );
              })}
              {pipeline.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  <Briefcase className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Нет сделок в воронке</p>
                </div>
              )}
            </div>
          </div>

          {/* Sources */}
          {stats.sources && stats.sources.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-purple-400" /> Источники лидов
              </h2>
              <div className="space-y-2">
                {stats.sources.map(s => {
                  const totalCount = stats.sources.reduce((a, x) => a + x.count, 0);
                  const pct = totalCount > 0 ? Math.round(s.count / totalCount * 100) : 0;
                  return (
                    <div key={s.source} className="flex items-center gap-3 p-3 bg-slate-800/80 rounded-xl border border-slate-700/50">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-slate-200">{sourceLabel(s.source)}</span>
                          <span className="text-xs text-slate-400">{s.count} сделок</span>
                        </div>
                        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-purple-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <span className="text-purple-400 font-bold text-sm w-10 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">Быстрые действия</h2>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => { setEditingClient(null); setShowClientForm(true); setActiveTab('clients'); }}
                className="flex items-center gap-3 p-4 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/30 rounded-2xl transition-colors">
                <UserPlus className="w-5 h-5 text-blue-400" />
                <span className="text-blue-300 font-medium text-sm">Новый клиент</span>
              </button>
              <button onClick={() => { setEditingDeal(null); setShowDealForm(true); setActiveTab('deals'); }}
                className="flex items-center gap-3 p-4 bg-green-600/20 hover:bg-green-600/30 border border-green-600/30 rounded-2xl transition-colors">
                <DollarSign className="w-5 h-5 text-green-400" />
                <span className="text-green-300 font-medium text-sm">Новая сделка</span>
              </button>
              <button onClick={() => { setEditingTask(null); setTaskFormOpen(true); setActiveTab('tasks'); }}
                className="flex items-center gap-3 p-4 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-600/30 rounded-2xl transition-colors">
                <CheckCircle className="w-5 h-5 text-purple-400" />
                <span className="text-purple-300 font-medium text-sm">Новая задача</span>
              </button>
              {profession === 'realestate' && (
                <button onClick={() => { setEditingProperty(null); setShowPropertyForm(true); setActiveTab('properties'); }}
                  className="flex items-center gap-3 p-4 bg-orange-600/20 hover:bg-orange-600/30 border border-orange-600/30 rounded-2xl transition-colors">
                  <Home className="w-5 h-5 text-orange-400" />
                  <span className="text-orange-300 font-medium text-sm">Новый объект</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          CLIENTS TAB
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'clients' && (
        <div className="p-4 space-y-4">
          {/* Toolbar */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
              <input
                className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                placeholder="Поиск клиентов..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              onClick={() => { setEditingClient(null); setShowClientForm(true); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-xl text-white font-medium text-sm transition-colors"
            >
              <Plus className="w-4 h-4" /> Добавить
            </button>
          </div>

          {filteredClients.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 mx-auto mb-2 text-slate-600" />
              <p className="text-slate-400">
                {searchQuery ? 'Нет результатов' : 'Клиентов нет'}
              </p>
              {!searchQuery && (
                <button onClick={() => { setEditingClient(null); setShowClientForm(true); }}
                  className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm">
                  Добавить первого клиента
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredClients.map(client => (
                <div key={client.id} className="bg-slate-800/80 rounded-2xl border border-slate-700/50 p-4">
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-blue-600/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-400 font-semibold text-sm">
                        {client.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{client.name}</p>
                      {client.company && (
                        <p className="text-xs text-slate-400 truncate">{client.company}</p>
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
                        {client.messenger_conversation_id && (
                          <button
                            onClick={() => navigate(`/chat/${client.messenger_conversation_id}`)}
                            className="flex items-center gap-1 px-2 py-1 bg-purple-600/20 text-purple-400 rounded-lg text-xs">
                            <MessageSquare className="w-3 h-3" /> Чат
                          </button>
                        )}
                      </div>
                      {/* Tags */}
                      {client.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {client.tags.map(tag => (
                            <span key={tag} className="px-2 py-0.5 bg-slate-700 text-slate-300 rounded-full text-xs">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Actions */}
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setEditingClient(client); setShowClientForm(true); }}
                        className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
                        <Edit2 className="w-4 h-4 text-slate-400" />
                      </button>
                      <button
                        onClick={() => handleDeleteClient(client.id)}
                        className="p-2 hover:bg-red-500/20 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4 text-slate-500 hover:text-red-400" />
                      </button>
                    </div>
                  </div>
                  {/* Deal link */}
                  {deals.filter(d => d.client_id === client.id && !d.lost).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-700/50 flex items-center gap-2">
                      <Briefcase className="w-3 h-3 text-slate-500" />
                      <span className="text-xs text-slate-400">
                        {deals.filter(d => d.client_id === client.id && !d.lost).length} активных сделок
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          DEALS TAB — Kanban board
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'deals' && (
        <div className="p-4 space-y-4">
          {/* Toolbar */}
          <div className="flex gap-2">
            <div className="flex-1 overflow-x-auto scrollbar-hide flex gap-2 py-1">
              <button
                onClick={() => setKanbanStage(null)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  !kanbanStage ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'
                }`}
              >
                Все ({deals.length})
              </button>
              {STAGES.map(s => {
                const cnt = dealsByStage[s.value]?.length ?? 0;
                if (cnt === 0) return null;
                return (
                  <button key={s.value}
                    onClick={() => setKanbanStage(kanbanStage === s.value ? null : s.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      kanbanStage === s.value ? `${s.color} text-white` : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {s.label} ({cnt})
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => { setEditingDeal(null); setShowDealForm(true); }}
              className="flex items-center gap-1 px-3 py-2 bg-green-600 hover:bg-green-700 rounded-xl text-white text-sm font-medium transition-colors flex-shrink-0"
            >
              <Plus className="w-4 h-4" /> Сделка
            </button>
          </div>

          {/* Kanban list */}
          {filteredDeals.length === 0 ? (
            <div className="text-center py-12">
              <Briefcase className="w-12 h-12 mx-auto mb-2 text-slate-600" />
              <p className="text-slate-400">Нет сделок</p>
              <button onClick={() => { setEditingDeal(null); setShowDealForm(true); }}
                className="mt-3 px-4 py-2 bg-green-600 text-white rounded-xl text-sm">
                Создать сделку
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDeals.map(deal => {
                const stageConf = STAGES.find(s => s.value === deal.stage);
                const cf = deal.custom_fields as Record<string, unknown>;
                const commissionAmt = cf?.commission_amount as number | undefined;
                return (
                  <div key={deal.id} className="bg-slate-800/80 rounded-2xl border border-slate-700/50 p-4">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-3 h-3 rounded-full flex-shrink-0 ${
                        deal.won ? 'bg-green-500' : deal.lost ? 'bg-red-500' : stageConf?.color.replace('bg-', 'bg-') ?? 'bg-blue-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium">{deal.title}</p>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {deal.client_id && (
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <Users className="w-3 h-3" /> {getClientName(deal.client_id)}
                            </span>
                          )}
                          {deal.value > 0 && (
                            <span className="text-xs text-green-400 font-medium">
                              {deal.value.toLocaleString()} ₽
                            </span>
                          )}
                          {commissionAmt && commissionAmt > 0 && (
                            <span className="text-xs text-amber-400">
                              ком: {commissionAmt.toLocaleString()} ₽
                            </span>
                          )}
                        </div>
                        {/* Stage badge */}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            deal.won ? 'bg-green-600/30 text-green-400' :
                            deal.lost ? 'bg-red-600/30 text-red-400' :
                            'bg-slate-700 text-slate-300'
                          }`}>
                            {STAGE_NAMES[deal.stage] ?? deal.stage}
                          </span>
                          {(cf?.mortgage as boolean) && (
                            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full text-xs">
                              Ипотека {cf?.mortgage_bank ? `(${cf.mortgage_bank})` : ''}
                            </span>
                          )}
                          {deal.expected_close_date && (
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(deal.expected_close_date).toLocaleDateString('ru-RU')}
                            </span>
                          )}
                        </div>
                        {/* Stage move buttons */}
                        {!deal.won && !deal.lost && (
                          <div className="flex gap-1 mt-3 overflow-x-auto scrollbar-hide">
                            {STAGES.filter(s => s.value !== deal.stage && s.value !== 'won' && s.value !== 'lost').slice(0, 4).map(s => (
                              <button key={s.value}
                                onClick={() => handleMoveDeal(deal.id, s.value)}
                                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs whitespace-nowrap transition-colors">
                                → {s.label}
                              </button>
                            ))}
                            <button onClick={() => handleMoveDeal(deal.id, 'won')}
                              className="px-2 py-1 bg-green-600/30 hover:bg-green-600 text-green-400 rounded-lg text-xs whitespace-nowrap transition-colors">
                              ✓ Закрыть
                            </button>
                            <button onClick={() => handleMoveDeal(deal.id, 'lost')}
                              className="px-2 py-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg text-xs whitespace-nowrap transition-colors">
                              ✗ Отказ
                            </button>
                          </div>
                        )}
                      </div>
                      {/* Actions */}
                      <div className="flex flex-col gap-1">
                        <button onClick={() => { setEditingDeal(deal); setShowDealForm(true); }}
                          className="p-1.5 hover:bg-slate-700 rounded-lg"><Edit2 className="w-3.5 h-3.5 text-slate-400" /></button>
                        <button onClick={() => handleDeleteDeal(deal.id)}
                          className="p-1.5 hover:bg-red-500/20 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-slate-500" /></button>
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
          TASKS TAB
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'tasks' && (
        <div className="p-4 space-y-4">
          <div className="flex gap-2">
            <button
              onClick={() => { setEditingTask(null); setTaskForm({ title:'', priority:'medium', due_date:'', client_id:'' }); setTaskFormOpen(true); }}
              className="w-full flex items-center justify-center gap-2 py-3 bg-purple-600 hover:bg-purple-700 rounded-xl text-white font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Добавить задачу
            </button>
          </div>

          {tasks.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="w-12 h-12 mx-auto mb-2 text-slate-600" />
              <p className="text-slate-400">Задач нет</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Overdue */}
              {overdueTasks.length > 0 && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl mb-3">
                  <p className="text-red-400 text-xs font-medium">⚠️ Просроченные ({overdueTasks.length})</p>
                </div>
              )}
              {tasks
                .sort((a, b) => {
                  const pri = { high: 0, medium: 1, low: 2 };
                  if (a.status === 'completed' && b.status !== 'completed') return 1;
                  if (b.status === 'completed' && a.status !== 'completed') return -1;
                  return (pri[a.priority] ?? 1) - (pri[b.priority] ?? 1);
                })
                .map(task => {
                  const isOverdue = task.status !== 'completed' && task.status !== 'cancelled'
                    && task.due_date && new Date(task.due_date) < new Date();
                  return (
                    <div key={task.id} className={`bg-slate-800/80 rounded-xl border p-3 flex items-start gap-3 ${
                      task.status === 'completed' ? 'border-slate-700/30 opacity-60' :
                      isOverdue ? 'border-red-500/30' : 'border-slate-700/50'
                    }`}>
                      <button
                        onClick={() => task.status !== 'completed' && handleCompleteTask(task.id)}
                        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          task.status === 'completed'
                            ? 'bg-green-600 border-green-600'
                            : 'border-slate-500 hover:border-green-500'
                        }`}
                      >
                        {task.status === 'completed' && <Check className="w-3 h-3 text-white" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${task.status === 'completed' ? 'line-through text-slate-500' : 'text-white'}`}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                            task.priority === 'high' ? 'bg-red-500/20 text-red-400' :
                            task.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-slate-600 text-slate-400'
                          }`}>
                            {task.priority === 'high' ? '↑ Высокий' : task.priority === 'medium' ? '→ Средний' : '↓ Низкий'}
                          </span>
                          {task.due_date && (
                            <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-400' : 'text-slate-400'}`}>
                              <Calendar className="w-3 h-3" />
                              {new Date(task.due_date).toLocaleDateString('ru-RU')}
                            </span>
                          )}
                          {task.client_id && (
                            <span className="text-xs text-slate-400">{getClientName(task.client_id)}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => {
                          setEditingTask(task);
                          setTaskForm({ title: task.title, priority: task.priority, due_date: task.due_date ?? '', client_id: task.client_id ?? '' });
                          setTaskFormOpen(true);
                        }} className="p-1.5 hover:bg-slate-700 rounded-lg">
                          <Edit2 className="w-3 h-3 text-slate-400" />
                        </button>
                        <button onClick={() => handleDeleteTask(task.id)} className="p-1.5 hover:bg-red-500/20 rounded-lg">
                          <Trash2 className="w-3 h-3 text-slate-500" />
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
          PROPERTIES TAB (Real Estate)
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'properties' && (
        <div className="p-4 space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
              <input
                className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                placeholder="Поиск объектов..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              onClick={() => { setEditingProperty(null); setShowPropertyForm(true); }}
              className="flex items-center gap-1 px-3 py-2 bg-orange-600 hover:bg-orange-700 rounded-xl text-white text-sm font-medium"
            >
              <Plus className="w-4 h-4" /> Объект
            </button>
          </div>

          {filteredProperties.length === 0 ? (
            <div className="text-center py-12">
              <Home className="w-12 h-12 mx-auto mb-2 text-slate-600" />
              <p className="text-slate-400">{searchQuery ? 'Нет результатов' : 'Объектов нет'}</p>
              {!searchQuery && (
                <button onClick={() => { setEditingProperty(null); setShowPropertyForm(true); }}
                  className="mt-3 px-4 py-2 bg-orange-600 text-white rounded-xl text-sm">
                  Добавить первый объект
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredProperties.map(prop => (
                <div key={prop.id} className="bg-slate-800/80 rounded-2xl border border-slate-700/50 p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center flex-shrink-0 text-xl">
                      {PROPERTY_TYPE_ICONS[prop.property_type] ?? '🏠'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-white font-medium leading-tight">{prop.title}</p>
                        <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full ${PROPERTY_STATUS_COLORS[prop.status] ?? ''}`}>
                          {PROPERTY_STATUS_LABELS[prop.status] ?? prop.status}
                        </span>
                      </div>
                      {prop.address && (
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {prop.address}
                          {prop.district && ` · ${prop.district}`}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        {prop.price && (
                          <span className="text-green-400 font-bold text-sm">
                            {(prop.price / 1_000_000).toFixed(2)} M ₽
                          </span>
                        )}
                        {prop.area_total && <span className="text-slate-400 text-xs">{prop.area_total} м²</span>}
                        {prop.rooms !== null && <span className="text-slate-400 text-xs">{prop.rooms === 0 ? 'Студия' : `${prop.rooms}-к`}</span>}
                        {prop.floor && prop.floors_total && <span className="text-slate-400 text-xs">{prop.floor}/{prop.floors_total} эт.</span>}
                        {prop.metro_station && (
                          <span className="text-slate-400 text-xs">м. {prop.metro_station}{prop.metro_minutes ? ` ${prop.metro_minutes} мин` : ''}</span>
                        )}
                      </div>
                      {prop.exclusive && (
                        <div className="flex items-center gap-1 mt-2">
                          <Star className="w-3 h-3 text-amber-400" />
                          <span className="text-xs text-amber-400">Эксклюзив</span>
                        </div>
                      )}
                      {prop.commission_percent && (
                        <p className="text-xs text-slate-400 mt-1">
                          Комис. {prop.commission_percent}%
                          {prop.price ? ` = ${Math.round(prop.price * prop.commission_percent / 100).toLocaleString()} ₽` : ''}
                        </p>
                      )}
                      {prop.features.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {prop.features.slice(0, 4).map(f => (
                            <span key={f} className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">{f}</span>
                          ))}
                          {prop.features.length > 4 && (
                            <span className="text-xs text-slate-500">+{prop.features.length - 4}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <button onClick={() => { setEditingProperty(prop); setShowPropertyForm(true); }}
                        className="p-1.5 hover:bg-slate-700 rounded-lg"><Edit2 className="w-3.5 h-3.5 text-slate-400" /></button>
                      <button onClick={() => handleDeleteProperty(prop.id)}
                        className="p-1.5 hover:bg-red-500/20 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-slate-500" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          SHOWINGS TAB (Real Estate)
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'showings' && (
        <div className="p-4 space-y-4">
          {showings.length === 0 ? (
            <div className="text-center py-12">
              <Eye className="w-12 h-12 mx-auto mb-2 text-slate-600" />
              <p className="text-slate-400">Просмотров нет</p>
              <p className="text-xs text-slate-500 mt-1">Просмотры создаются через карточку сделки</p>
            </div>
          ) : (
            <div className="space-y-3">
              {showings
                .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
                .map(showing => {
                  const date = new Date(showing.scheduled_at);
                  const isToday = date.toDateString() === new Date().toDateString();
                  const isFuture = date > new Date();
                  return (
                    <div key={showing.id} className={`bg-slate-800/80 rounded-2xl border p-4 ${
                      showing.status === 'scheduled' && isToday ? 'border-cyan-500/30' :
                      showing.status === 'scheduled' && isFuture ? 'border-slate-700/50' :
                      showing.status === 'completed' ? 'border-green-500/20' :
                      'border-slate-700/30 opacity-70'
                    }`}>
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-xl flex-shrink-0 ${
                          isToday && showing.status === 'scheduled' ? 'bg-cyan-500/20' : 'bg-slate-700'
                        }`}>
                          <Eye className={`w-4 h-4 ${isToday && showing.status === 'scheduled' ? 'text-cyan-400' : 'text-slate-400'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium">{getPropertyTitle(showing.property_id)}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {getClientName(showing.client_id)}
                          </p>
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-xs text-slate-300">
                              {date.toLocaleDateString('ru-RU')} {date.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' })}
                              {showing.duration_min && ` · ${showing.duration_min} мин`}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              showing.status === 'scheduled' ? 'bg-blue-500/20 text-blue-400' :
                              showing.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                              showing.status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                              'bg-slate-600 text-slate-300'
                            }`}>
                              {showing.status === 'scheduled' ? 'Запланирован' :
                               showing.status === 'completed' ? 'Завершён' :
                               showing.status === 'cancelled' ? 'Отменён' : 'Не явился'}
                            </span>
                          </div>
                          {showing.outcome && (
                            <p className="text-xs text-slate-400 mt-1">Итог: {showing.outcome}</p>
                          )}
                          {showing.feedback && (
                            <p className="text-xs text-slate-500 mt-1 italic">{showing.feedback}</p>
                          )}
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
          MODALS
      ══════════════════════════════════════════════════════════ */}

      {/* Client Form */}
      {showClientForm && (
        <CRMClientForm
          profession={profession}
          initial={editingClient ?? undefined}
          onClose={() => { setShowClientForm(false); setEditingClient(null); }}
          onSaved={(saved) => {
            setClients(prev => editingClient
              ? prev.map(c => c.id === saved.id ? saved : c)
              : [saved, ...prev]
            );
            setShowClientForm(false);
            setEditingClient(null);
          }}
        />
      )}

      {/* Deal Form */}
      {showDealForm && (
        <CRMDealForm
          profession={profession}
          initial={editingDeal ?? undefined}
          onClose={() => { setShowDealForm(false); setEditingDeal(null); }}
          onSaved={(saved) => {
            setDeals(prev => editingDeal
              ? prev.map(d => d.id === saved.id ? saved : d)
              : [saved, ...prev]
            );
            setShowDealForm(false);
            setEditingDeal(null);
          }}
        />
      )}

      {/* Property Form */}
      {showPropertyForm && profession === 'realestate' && (
        <CRMPropertyForm
          initial={editingProperty ?? undefined}
          onClose={() => { setShowPropertyForm(false); setEditingProperty(null); }}
          onSaved={(saved) => {
            setProperties(prev => editingProperty
              ? prev.map(p => p.id === saved.id ? saved : p)
              : [saved, ...prev]
            );
            setShowPropertyForm(false);
            setEditingProperty(null);
          }}
        />
      )}

      {/* Task Form (inline modal) */}
      {taskFormOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setTaskFormOpen(false); setEditingTask(null); }} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold">{editingTask ? 'Редактировать задачу' : 'Новая задача'}</h3>
              <button onClick={() => { setTaskFormOpen(false); setEditingTask(null); }}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Название *</label>
              <input
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                placeholder="Позвонить клиенту, показать объект..."
                value={taskForm.title}
                onChange={e => setTaskForm(prev => ({ ...prev, title: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Приоритет</label>
                <div className="flex gap-1">
                  {(['low','medium','high'] as const).map(p => (
                    <button key={p}
                      onClick={() => setTaskForm(prev => ({ ...prev, priority: p }))}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                        taskForm.priority === p
                          ? p === 'high' ? 'bg-red-600 text-white'
                            : p === 'medium' ? 'bg-yellow-600 text-white'
                            : 'bg-slate-500 text-white'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {p === 'high' ? '↑' : p === 'medium' ? '→' : '↓'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Срок</label>
                <input type="date"
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500 text-sm"
                  value={taskForm.due_date}
                  onChange={e => setTaskForm(prev => ({ ...prev, due_date: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Клиент</label>
              <select
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-purple-500"
                value={taskForm.client_id}
                onChange={e => setTaskForm(prev => ({ ...prev, client_id: e.target.value }))}
              >
                <option value="">— без клиента —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button
              onClick={handleSaveTask}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium transition-colors"
            >
              {editingTask ? 'Сохранить' : 'Создать задачу'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CRMDashboard;
