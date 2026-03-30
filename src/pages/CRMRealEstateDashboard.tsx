/**
 * CRMRealEstateDashboard — специализированная CRM для недвижимости
 *
 * Реализованные функции (сравнение с мировыми лидерами):
 *
 * ✓ Bitrix24 RE:
 *   - Воронка Kanban по стадиям сделки
 *   - Карточки клиентов с историей контактов
 *   - Задачи с типами (звонок/email/WhatsApp/встреча/показ/документ)
 *   - Источники лидов (ЦИАН/Авито/Яндекс/Домклик/Instagram/ВК)
 *   - Документооборот (договор/акт/доверенность/ипотека)
 *
 * ✓ TopN Lab:
 *   - База объектов с расширенными фильтрами
 *   - Автоматический подбор объектов под требования клиента (match score 0-100)
 *   - Мультилистинг (публикация на ЦИАН/Авито/Яндекс/Домклик)
 *   - Аналитика районов (цена/м², тренды, инфраструктура)
 *
 * ✓ ReBPM:
 *   - Ипотечный калькулятор с подбором банков
 *   - Комиссионный калькулятор (агент/компания/НДС)
 *   - Стадии сделки с ипотекой (одобрение/договор/регистрация)
 *   - Документальный чеклист по сделке
 *
 * ✓ Follow Up Boss:
 *   - Быстрый контакт (звонок/WhatsApp/email прямо из карточки)
 *   - Lead score (0-100) с визуализацией
 *   - Следующий контакт (next_contact_at)
 *   - Drip-кампании (автоматические касания)
 *
 * ✓ kvCORE / Chime:
 *   - Поведенческая сегментация (горячий/тёплый/холодный)
 *   - Сравнение объектов (до 4 одновременно)
 *   - АВМ — автоматическая оценка рыночной стоимости
 *
 * ✓ LionDesk / Wise Agent:
 *   - Показы с маршрутом и фото-отчётом
 *   - Результат показа (очень интересует/интересует/нейтрально/не интересует)
 *   - Расписание показов на день/неделю
 *
 * Вкладки:
 * 1. Дашборд — KPI, воронка, задачи на сегодня, показы
 * 2. Клиенты — список с фильтрами, lead score, быстрый контакт
 * 3. Объекты — каталог с фильтрами, мультилистинг, АВМ
 * 4. Сделки — Kanban по стадиям, ипотека, комиссия
 * 5. Показы — расписание, маршрут, результаты
 * 6. Задачи — список с типами и приоритетами
 * 7. Документы — чеклист по сделке
 * 8. Ипотека — калькулятор + подбор банков
 * 9. Аналитика — районы, цены/м², тренды
 * 10. Подбор — автоматический матчинг объектов под клиента
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Users, Home, Briefcase, CheckCircle, Clock, TrendingUp,
  Plus, Phone, Mail, MessageSquare, Eye, Search, Filter, ChevronRight,
  X, Star, AlertTriangle, BarChart2, MapPin, Edit2, Trash2, Check,
  RefreshCw, Building2, DollarSign, Calendar, FileText, Calculator,
  Target, Zap, Award, ChevronDown, ChevronUp, ExternalLink,
} from "lucide-react";
import {
  crmRE,
  type REClient, type REProperty, type REDeal, type REShowing,
  type RETask, type REDocument, type REDistrictAnalytics,
  type REDashboardStats, type REMatchedProperty,
  type REClientStage, type REDealStage, type REPropertyStatus,
  RE_CLIENT_STAGES, RE_DEAL_STAGES, RE_LEAD_SOURCES,
  RE_PROPERTY_TYPES, RE_MORTGAGE_BANKS, RE_DOC_TYPES,
} from "@/lib/crmRealEstate";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'clients' | 'properties' | 'deals' | 'showings' | 'tasks' | 'documents' | 'mortgage' | 'analytics' | 'matching';

// ─── Constants ────────────────────────────────────────────────────────────────

const PROPERTY_STATUS_COLORS: Record<REPropertyStatus, string> = {
  available:  'text-green-400 bg-green-400/10 border-green-400/30',
  reserved:   'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  sold:       'text-red-400 bg-red-400/10 border-red-400/30',
  rented:     'text-purple-400 bg-purple-400/10 border-purple-400/30',
  off_market: 'text-slate-400 bg-slate-400/10 border-slate-400/30',
  draft:      'text-slate-500 bg-slate-500/10 border-slate-500/30',
};

const PROPERTY_STATUS_LABELS: Record<REPropertyStatus, string> = {
  available: 'Свободен', reserved: 'Резерв', sold: 'Продан',
  rented: 'Сдан', off_market: 'Снят', draft: 'Черновик',
};

const CLIENT_TYPE_LABELS: Record<string, string> = {
  buyer: 'Покупатель', seller: 'Продавец', tenant: 'Арендатор',
  landlord: 'Арендодатель', investor: 'Инвестор',
};

const FEEDBACK_LABELS: Record<string, { label: string; color: string }> = {
  very_interested: { label: '🔥 Очень интересует', color: 'text-green-400' },
  interested:      { label: '✅ Интересует',       color: 'text-emerald-400' },
  neutral:         { label: '😐 Нейтрально',       color: 'text-slate-400' },
  not_interested:  { label: '👎 Не интересует',    color: 'text-orange-400' },
  rejected:        { label: '❌ Отказ',             color: 'text-red-400' },
};

const TASK_TYPE_ICONS: Record<string, string> = {
  call: '📞', email: '📧', whatsapp: '💬', meeting: '🤝',
  showing: '🏠', document: '📄', other: '📌',
};

const PRIORITY_COLORS: Record<string, string> = {
  low:    'text-slate-400 bg-slate-400/10',
  medium: 'text-blue-400 bg-blue-400/10',
  high:   'text-orange-400 bg-orange-400/10',
  urgent: 'text-red-400 bg-red-400/10',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Низкий', medium: 'Средний', high: 'Высокий', urgent: 'Срочно',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString('ru-RU');
const fmtM = (n: number) => `${(n / 1_000_000).toFixed(2)} M ₽`;
const fmtK = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K` : String(n);

function leadScoreColor(score: number): string {
  if (score >= 70) return 'text-green-400';
  if (score >= 40) return 'text-yellow-400';
  return 'text-slate-400';
}

function leadScoreLabel(score: number): string {
  if (score >= 70) return '🔥 Горячий';
  if (score >= 40) return '🌡️ Тёплый';
  return '❄️ Холодный';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function isOverdue(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon: Icon, value, label, color, sub, onClick }: {
  icon: React.ElementType; value: string | number; label: string;
  color: string; sub?: string; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-slate-800/80 rounded-2xl p-4 border border-slate-700/50 ${onClick ? 'cursor-pointer hover:border-slate-600 transition-colors' : ''}`}
    >
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
}

function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CRMRealEstateDashboard() {
  const navigate = useNavigate();

  // ── State ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Data
  const [stats, setStats] = useState<REDashboardStats | null>(null);
  const [clients, setClients] = useState<REClient[]>([]);
  const [properties, setProperties] = useState<REProperty[]>([]);
  const [deals, setDeals] = useState<REDeal[]>([]);
  const [showings, setShowings] = useState<REShowing[]>([]);
  const [tasks, setTasks] = useState<RETask[]>([]);
  const [documents, setDocuments] = useState<REDocument[]>([]);
  const [districtAnalytics, setDistrictAnalytics] = useState<REDistrictAnalytics[]>([]);
  const [matchedProperties, setMatchedProperties] = useState<REMatchedProperty[]>([]);
  const [matchingClientId, setMatchingClientId] = useState<string | null>(null);

  // Filters
  const [clientStageFilter, setClientStageFilter] = useState<REClientStage | 'all'>('all');
  const [propertyStatusFilter, setPropertyStatusFilter] = useState<REPropertyStatus | 'all'>('all');
  const [dealStageFilter, setDealStageFilter] = useState<REDealStage | 'all'>('all');
  const [kanbanView, setKanbanView] = useState(true);

  // Modals
  const [showClientModal, setShowClientModal] = useState(false);
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [showDealModal, setShowDealModal] = useState(false);
  const [showShowingModal, setShowShowingModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const [showMortgageModal, setShowMortgageModal] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  // Forms
  const [clientForm, setClientForm] = useState({
    name: '', phone: '', email: '', telegram: '', whatsapp: '',
    client_type: 'buyer' as REClient['client_type'],
    budget_min: '', budget_max: '',
    deal_type: 'sale' as REClient['deal_type'],
    property_types: [] as string[],
    rooms_min: '', rooms_max: '',
    districts: [] as string[],
    mortgage_ready: false,
    source: 'manual' as REClient['source'],
    notes: '',
  });

  const [propertyForm, setPropertyForm] = useState({
    title: '', property_type: 'apartment' as REProperty['property_type'],
    deal_type: 'sale' as REProperty['deal_type'],
    status: 'available' as REPropertyStatus,
    address: '', city: 'Москва', district: '', metro_station: '',
    rooms: '', floor: '', floors_total: '', area_total: '', area_kitchen: '',
    year_built: '', renovation: '', price: '',
    commission_pct: '2', commission_who: 'buyer' as REProperty['commission_who'],
    mortgage_possible: true,
    seller_name: '', seller_phone: '',
    description: '', notes: '',
    published_cian: false, published_avito: false,
    published_yandex: false, published_domclick: false,
  });

  const [dealForm, setDealForm] = useState({
    title: '', deal_type: 'sale' as REDeal['deal_type'],
    stage: 'new' as REDealStage,
    client_id: '', property_id: '',
    deal_price: '', commission_pct: '2',
    mortgage_bank: '', mortgage_amount: '', mortgage_rate: '', mortgage_term: '20',
    notes: '',
  });

  const [showingForm, setShowingForm] = useState({
    client_id: '', property_id: '', deal_id: '',
    scheduled_at: '', duration_min: '30',
    agent_notes: '',
  });

  const [taskForm, setTaskForm] = useState({
    title: '', task_type: 'call' as RETask['task_type'],
    priority: 'medium' as RETask['priority'],
    due_date: '', client_id: '', property_id: '', deal_id: '', notes: '',
  });

  const [docForm, setDocForm] = useState({
    doc_type: 'contract_sale' as REDocument['doc_type'],
    title: '', deal_id: '', client_id: '', notes: '',
  });

  // Mortgage calculator
  const [mortgageCalc, setMortgageCalc] = useState({
    price: '10000000', down_pct: '20', rate: '10.9', term: '20',
    bank: 'Сбербанк',
  });
  const [mortgageResult, setMortgageResult] = useState<{
    loan_amount: number; monthly_payment: number; total_payment: number;
    overpayment: number; down_payment: number;
  } | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  // ── Load ───────────────────────────────────────────────────────────────────

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [
        statsData, clientsData, propertiesData, dealsData,
        showingsData, tasksData, analyticsData,
      ] = await Promise.all([
        crmRE.getDashboardStats().catch(() => null),
        crmRE.getClients(),
        crmRE.getProperties(),
        crmRE.getDeals(),
        crmRE.getShowings(),
        crmRE.getTasks(),
        crmRE.getDistrictAnalytics(),
      ]);
      if (statsData) setStats(statsData);
      setClients(clientsData);
      setProperties(propertiesData);
      setDeals(dealsData);
      setShowings(showingsData);
      setTasks(tasksData);
      setDistrictAnalytics(analyticsData);
    } catch (err) {
      logger.error('[CRMRealEstate] load error', { error: err });
      if (!silent) toast.error('Ошибка загрузки CRM');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // ── Computed ───────────────────────────────────────────────────────────────

  const overdueTasks = useMemo(() =>
    tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled' && isOverdue(t.due_date)),
    [tasks]
  );

  const todayShowings = useMemo(() =>
    showings.filter(s => {
      const d = new Date(s.scheduled_at);
      return d.toDateString() === new Date().toDateString() && s.status === 'scheduled';
    }),
    [showings]
  );

  const filteredClients = useMemo(() =>
    clients.filter(c => {
      const matchStage = clientStageFilter === 'all' || c.stage === clientStageFilter;
      const matchSearch = !searchQuery ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone?.includes(searchQuery) ||
        c.email?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchStage && matchSearch;
    }),
    [clients, clientStageFilter, searchQuery]
  );

  const filteredProperties = useMemo(() =>
    properties.filter(p => {
      const matchStatus = propertyStatusFilter === 'all' || p.status === propertyStatusFilter;
      const matchSearch = !searchQuery ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.district?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchStatus && matchSearch;
    }),
    [properties, propertyStatusFilter, searchQuery]
  );

  const filteredDeals = useMemo(() =>
    deals.filter(d => dealStageFilter === 'all' || d.stage === dealStageFilter),
    [deals, dealStageFilter]
  );

  const dealsByStage = useMemo(() =>
    RE_DEAL_STAGES.reduce((acc, s) => {
      acc[s.value] = deals.filter(d => d.stage === s.value);
      return acc;
    }, {} as Record<string, REDeal[]>),
    [deals]
  );

  const compareProperties = useMemo(() =>
    properties.filter(p => compareIds.includes(p.id)),
    [properties, compareIds]
  );

  const getClientName = (id: string | null | undefined) =>
    clients.find(c => c.id === id)?.name ?? '—';
  const getPropertyTitle = (id: string | null | undefined) =>
    properties.find(p => p.id === id)?.title ?? '—';

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleCreateClient = async () => {
    if (!clientForm.name.trim()) { toast.error('Укажите имя клиента'); return; }
    try {
      const created = await crmRE.createClient({
        name: clientForm.name,
        phone: clientForm.phone || null,
        email: clientForm.email || null,
        telegram: clientForm.telegram || null,
        whatsapp: clientForm.whatsapp || null,
        client_type: clientForm.client_type,
        budget_min: clientForm.budget_min ? Number(clientForm.budget_min) : null,
        budget_max: clientForm.budget_max ? Number(clientForm.budget_max) : null,
        deal_type: clientForm.deal_type,
        property_types: clientForm.property_types as REClient['property_types'],
        rooms_min: clientForm.rooms_min ? Number(clientForm.rooms_min) : null,
        rooms_max: clientForm.rooms_max ? Number(clientForm.rooms_max) : null,
        area_min: null, area_max: null,
        districts: clientForm.districts,
        metro_stations: [],
        mortgage_ready: clientForm.mortgage_ready,
        mortgage_bank: null, mortgage_amount: null,
        source: clientForm.source,
        source_detail: null,
        lead_score: 0,
        stage: 'new',
        tags: [],
        notes: clientForm.notes || null,
        assigned_to: null,
        last_contact_at: null,
        next_contact_at: null,
        drip_campaign: null,
      });
      setClients(prev => [created, ...prev]);
      setShowClientModal(false);
      toast.success(`✅ Клиент ${created.name} добавлен`);
    } catch (err) {
      logger.error('[CRMRealEstate] operation error', { error: err });
      toast.error('Ошибка создания клиента');
    }
  };

  const handleCreateProperty = async () => {
    if (!propertyForm.title.trim()) { toast.error('Укажите название объекта'); return; }
    if (!propertyForm.price) { toast.error('Укажите цену'); return; }
    try {
      const created = await crmRE.createProperty({
        title: propertyForm.title,
        property_type: propertyForm.property_type,
        deal_type: propertyForm.deal_type,
        status: propertyForm.status,
        address: propertyForm.address || null,
        city: propertyForm.city,
        district: propertyForm.district || null,
        metro_station: propertyForm.metro_station || null,
        metro_distance: null,
        lat: null, lng: null,
        rooms: propertyForm.rooms ? Number(propertyForm.rooms) : null,
        floor: propertyForm.floor ? Number(propertyForm.floor) : null,
        floors_total: propertyForm.floors_total ? Number(propertyForm.floors_total) : null,
        area_total: propertyForm.area_total ? Number(propertyForm.area_total) : null,
        area_living: null,
        area_kitchen: propertyForm.area_kitchen ? Number(propertyForm.area_kitchen) : null,
        ceiling_height: null,
        year_built: propertyForm.year_built ? Number(propertyForm.year_built) : null,
        renovation: propertyForm.renovation || null,
        balcony: false,
        parking: null,
        price: Number(propertyForm.price),
        price_negotiable: true,
        mortgage_possible: propertyForm.mortgage_possible,
        mortgage_rate: null,
        commission_pct: Number(propertyForm.commission_pct),
        commission_fixed: null,
        commission_who: propertyForm.commission_who,
        photos: [],
        video_url: null, virtual_tour_url: null, floor_plan_url: null,
        published_cian: propertyForm.published_cian,
        published_avito: propertyForm.published_avito,
        published_yandex: propertyForm.published_yandex,
        published_domclick: propertyForm.published_domclick,
        cian_id: null, avito_id: null,
        seller_client_id: null,
        seller_name: propertyForm.seller_name || null,
        seller_phone: propertyForm.seller_phone || null,
        avm_price: null, avm_updated_at: null,
        description: propertyForm.description || null,
        features: [],
        notes: propertyForm.notes || null,
      });
      setProperties(prev => [created, ...prev]);
      setShowPropertyModal(false);
      toast.success(`✅ Объект "${created.title}" добавлен`);
    } catch (err) {
      logger.error('[CRMRealEstate] operation error', { error: err });
      toast.error('Ошибка создания объекта');
    }
  };

  const handleCreateDeal = async () => {
    if (!dealForm.title.trim()) { toast.error('Укажите название сделки'); return; }
    try {
      const created = await crmRE.createDeal({
        title: dealForm.title,
        deal_type: dealForm.deal_type,
        stage: dealForm.stage,
        client_id: dealForm.client_id || null,
        property_id: dealForm.property_id || null,
        deal_price: dealForm.deal_price ? Number(dealForm.deal_price) : null,
        commission_pct: dealForm.commission_pct ? Number(dealForm.commission_pct) : null,
        commission_amount: dealForm.deal_price && dealForm.commission_pct
          ? Math.round(Number(dealForm.deal_price) * Number(dealForm.commission_pct) / 100)
          : null,
        deposit_amount: null, deposit_paid_at: null,
        mortgage_bank: dealForm.mortgage_bank || null,
        mortgage_amount: dealForm.mortgage_amount ? Number(dealForm.mortgage_amount) : null,
        mortgage_rate: dealForm.mortgage_rate ? Number(dealForm.mortgage_rate) : null,
        mortgage_term: dealForm.mortgage_term ? Number(dealForm.mortgage_term) : null,
        mortgage_approved: null, mortgage_approved_at: null,
        contract_signed_at: null, registration_date: null, keys_handover_date: null,
        won: false, lost: false, lost_reason: null,
        source: null, notes: dealForm.notes || null, assigned_to: null,
      });
      setDeals(prev => [created, ...prev]);
      setShowDealModal(false);
      toast.success(`✅ Сделка "${created.title}" создана`);
    } catch (err) {
      logger.error('[CRMRealEstate] operation error', { error: err });
      toast.error('Ошибка создания сделки');
    }
  };

  const handleMoveDeal = async (dealId: string, newStage: REDealStage) => {
    try {
      const updated = await crmRE.updateDeal(dealId, {
        stage: newStage,
        won: newStage === 'won',
        lost: newStage === 'lost',
      });
      setDeals(prev => prev.map(d => d.id === dealId ? updated : d));
      const stageLabel = RE_DEAL_STAGES.find(s => s.value === newStage)?.label ?? newStage;
      toast.success(`Сделка → ${stageLabel}`);
    } catch (_err) { toast.error('Ошибка обновления сделки'); }
  };

  const handleCreateShowing = async () => {
    if (!showingForm.scheduled_at) { toast.error('Укажите дату и время показа'); return; }
    try {
      const created = await crmRE.createShowing({
        client_id: showingForm.client_id || null,
        property_id: showingForm.property_id || null,
        deal_id: showingForm.deal_id || null,
        scheduled_at: showingForm.scheduled_at,
        duration_min: Number(showingForm.duration_min),
        status: 'scheduled',
        client_feedback: null, client_notes: null,
        agent_notes: showingForm.agent_notes || null,
        report_photos: [],
        route_order: 1, route_group_id: null,
      });
      setShowings(prev => [...prev, created].sort((a, b) =>
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      ));
      setShowShowingModal(false);
      toast.success('✅ Показ запланирован');
    } catch (err) {
      logger.error('[CRMRealEstate] operation error', { error: err });
      toast.error('Ошибка создания показа');
    }
  };

  const handleCompleteShowing = async (id: string, feedback: REShowing['client_feedback']) => {
    try {
      const updated = await crmRE.updateShowing(id, { status: 'completed', client_feedback: feedback });
      setShowings(prev => prev.map(s => s.id === id ? updated : s));
      toast.success('Показ завершён');
    } catch (_err) { toast.error('Ошибка обновления показа'); }
  };

  const handleCreateTask = async () => {
    if (!taskForm.title.trim()) { toast.error('Укажите название задачи'); return; }
    try {
      const created = await crmRE.createTask({
        title: taskForm.title,
        task_type: taskForm.task_type,
        priority: taskForm.priority,
        status: 'pending',
        due_date: taskForm.due_date || null,
        completed_at: null,
        client_id: taskForm.client_id || null,
        property_id: taskForm.property_id || null,
        deal_id: taskForm.deal_id || null,
        notes: taskForm.notes || null,
      });
      setTasks(prev => [created, ...prev]);
      setShowTaskModal(false);
      toast.success('✅ Задача создана');
    } catch (err) {
      logger.error('[CRMRealEstate] operation error', { error: err });
      toast.error('Ошибка создания задачи');
    }
  };

  const handleCompleteTask = async (id: string) => {
    try {
      const updated = await crmRE.completeTask(id);
      setTasks(prev => prev.map(t => t.id === id ? updated : t));
      toast.success('Задача выполнена ✓');
    } catch (_err) { toast.error('Ошибка'); }
  };

  const handleCreateDocument = async () => {
    if (!docForm.title.trim()) { toast.error('Укажите название документа'); return; }
    try {
      const created = await crmRE.createDocument({
        doc_type: docForm.doc_type,
        title: docForm.title,
        deal_id: docForm.deal_id || null,
        client_id: docForm.client_id || null,
        property_id: null,
        file_url: null, signed: false, signed_at: null, expires_at: null,
        notes: docForm.notes || null,
      });
      setDocuments(prev => [created, ...prev]);
      setShowDocModal(false);
      toast.success('✅ Документ добавлен');
    } catch (err) {
      logger.error('[CRMRealEstate] operation error', { error: err });
      toast.error('Ошибка создания документа');
    }
  };

  const handleCalcMortgage = async () => {
    setCalcLoading(true);
    try {
      const result = await crmRE.calcMortgage(
        Number(mortgageCalc.price),
        Number(mortgageCalc.down_pct),
        Number(mortgageCalc.rate),
        Number(mortgageCalc.term),
      );
      setMortgageResult(result);
    } catch (_err) {
      // Fallback: client-side calculation
      const price = Number(mortgageCalc.price);
      const loan = price * (1 - Number(mortgageCalc.down_pct) / 100);
      const r = Number(mortgageCalc.rate) / 100 / 12;
      const n = Number(mortgageCalc.term) * 12;
      const payment = r === 0 ? loan / n : loan * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
      setMortgageResult({
        loan_amount: Math.round(loan),
        monthly_payment: Math.round(payment),
        total_payment: Math.round(payment * n),
        overpayment: Math.round(payment * n - loan),
        down_payment: Math.round(price - loan),
      });
    } finally {
      setCalcLoading(false);
    }
  };

  const handleMatchProperties = async (clientId: string) => {
    setMatchingClientId(clientId);
    try {
      const matched = await crmRE.matchPropertiesForClient(clientId);
      setMatchedProperties(matched);
      setActiveTab('matching');
      toast.success(`Найдено ${matched.length} подходящих объектов`);
    } catch (_err) {
      toast.error('Ошибка подбора объектов');
    } finally {
      setMatchingClientId(null);
    }
  };

  const handleUpdatePropertyStatus = async (id: string, status: REPropertyStatus) => {
    try {
      const updated = await crmRE.updateProperty(id, { status });
      setProperties(prev => prev.map(p => p.id === id ? updated : p));
      toast.success(`Статус: ${PROPERTY_STATUS_LABELS[status]}`);
    } catch (_err) { toast.error('Ошибка обновления'); }
  };

  const handleUpdateClientStage = async (id: string, stage: REClientStage) => {
    try {
      const updated = await crmRE.updateClient(id, { stage });
      setClients(prev => prev.map(c => c.id === id ? updated : c));
      const stageLabel = RE_CLIENT_STAGES.find(s => s.value === stage)?.label ?? stage;
      toast.success(`Стадия → ${stageLabel}`);
    } catch (_err) { toast.error('Ошибка обновления'); }
  };

  const handleDeleteClient = async (id: string) => {
    if (!confirm('Удалить клиента?')) return;
    try {
      await crmRE.deleteClient(id);
      setClients(prev => prev.filter(c => c.id !== id));
      toast.success('Клиент удалён');
    } catch (_err) { toast.error('Ошибка удаления'); }
  };

  const handleDeleteProperty = async (id: string) => {
    if (!confirm('Удалить объект?')) return;
    try {
      await crmRE.deleteProperty(id);
      setProperties(prev => prev.filter(p => p.id !== id));
      toast.success('Объект удалён');
    } catch (_err) { toast.error('Ошибка удаления'); }
  };

  const handleDeleteDeal = async (id: string) => {
    if (!confirm('Удалить сделку?')) return;
    try {
      await crmRE.deleteDeal(id);
      setDeals(prev => prev.filter(d => d.id !== id));
      toast.success('Сделка удалена');
    } catch (_err) { toast.error('Ошибка удаления'); }
  };

  const toggleCompare = (id: string) => {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 4) { toast.warning('Максимум 4 объекта для сравнения'); return prev; }
      return [...prev, id];
    });
  };

  // ── AVM estimate ───────────────────────────────────────────────────────────
  const getAVMEstimate = (property: REProperty) => {
    if (!property.area_total || !property.district) return null;
    return crmRE.estimateAVM(
      property.district,
      property.area_total,
      property.rooms ?? 0,
      districtAnalytics,
    );
  };

  // ── Commission calc ────────────────────────────────────────────────────────
  const getCommission = (price: number, pct: number) =>
    crmRE.calcCommission(price, pct);

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Загрузка CRM Недвижимость...</p>
        </div>
      </div>
    );
  }

  // ─── Tabs config ───────────────────────────────────────────────────────────

  const TABS: Array<{ id: Tab; label: string; icon: string; badge?: number }> = [
    { id: 'dashboard',   label: 'Дашборд',   icon: '📊', badge: overdueTasks.length || undefined },
    { id: 'clients',     label: 'Клиенты',   icon: '👥', badge: clients.length },
    { id: 'properties',  label: 'Объекты',   icon: '🏠', badge: properties.filter(p => p.status === 'available').length },
    { id: 'deals',       label: 'Сделки',    icon: '💼', badge: deals.filter(d => !d.won && !d.lost).length },
    { id: 'showings',    label: 'Показы',    icon: '👁️', badge: todayShowings.length || undefined },
    { id: 'tasks',       label: 'Задачи',    icon: '✅', badge: overdueTasks.length || undefined },
    { id: 'documents',   label: 'Документы', icon: '📄' },
    { id: 'mortgage',    label: 'Ипотека',   icon: '🏦' },
    { id: 'analytics',   label: 'Аналитика', icon: '📈' },
    { id: 'matching',    label: 'Подбор',    icon: '🎯', badge: matchedProperties.length || undefined },
  ];

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 pb-24">

      {/* ── Header ── */}
      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700">
        <div className="flex items-center gap-3 px-4 pt-4 pb-2">
          <button onClick={() => navigate('/crm')} className="p-2 rounded-full hover:bg-slate-700">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white leading-tight">🏠 CRM Недвижимость</h1>
            {stats && (
              <p className="text-xs text-slate-400 truncate">
                {stats.active_deals} сделок · {stats.total_clients} клиентов
                · {stats.available_properties} объектов
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
        <div className="flex px-2 gap-0 overflow-x-auto scrollbar-hide">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSearchQuery(''); }}
              className={`relative flex items-center gap-1 px-2.5 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <span>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${
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
          1. DASHBOARD
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'dashboard' && (
        <div className="p-4 space-y-5">
          {/* KPI Grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={Users}      value={stats?.total_clients ?? clients.length}    label="Клиентов"       color="bg-blue-500/20 text-blue-400"    sub={`+${stats?.new_clients_month ?? 0} за месяц`} onClick={() => setActiveTab('clients')} />
            <StatCard icon={Home}       value={stats?.available_properties ?? properties.filter(p=>p.status==='available').length} label="Свободных объектов" color="bg-orange-500/20 text-orange-400" onClick={() => setActiveTab('properties')} />
            <StatCard icon={Briefcase}  value={stats?.active_deals ?? deals.filter(d=>!d.won&&!d.lost).length} label="Активных сделок" color="bg-green-500/20 text-green-400" sub={stats?.pipeline_value ? fmtM(stats.pipeline_value) : undefined} onClick={() => setActiveTab('deals')} />
            <StatCard icon={DollarSign} value={stats?.commission_month ? fmtK(stats.commission_month) + ' ₽' : '0 ₽'} label="Комиссия/месяц" color="bg-emerald-500/20 text-emerald-400" sub={`${stats?.won_deals_month ?? 0} сделок закрыто`} />
            <StatCard icon={Eye}        value={stats?.showings_today ?? todayShowings.length} label="Показов сегодня" color="bg-cyan-500/20 text-cyan-400" sub={`${stats?.showings_week ?? 0} за неделю`} onClick={() => setActiveTab('showings')} />
            <StatCard icon={TrendingUp} value={`${stats?.conversion_rate ?? 0}%`} label="Конверсия" color="bg-purple-500/20 text-purple-400" />
          </div>

          {/* Alerts */}
          {overdueTasks.length > 0 && (
            <div onClick={() => setActiveTab('tasks')} className="cursor-pointer p-4 bg-red-500/10 rounded-2xl border border-red-500/30 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-red-400 font-medium">⚠️ Просроченные задачи</p>
                <p className="text-sm text-red-400/70">{overdueTasks.length} задач требуют внимания</p>
              </div>
              <ChevronRight className="w-4 h-4 text-red-400/50" />
            </div>
          )}

          {todayShowings.length > 0 && (
            <div onClick={() => setActiveTab('showings')} className="cursor-pointer p-4 bg-cyan-500/10 rounded-2xl border border-cyan-500/30 flex items-center gap-3">
              <Eye className="w-5 h-5 text-cyan-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-cyan-400 font-medium">🏠 Показы сегодня</p>
                <p className="text-sm text-cyan-400/70">
                  {todayShowings.map(s => `${formatDateTime(s.scheduled_at)} — ${getPropertyTitle(s.property_id)}`).join(' · ')}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-cyan-400/50" />
            </div>
          )}

          {/* Pipeline */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-white">Воронка сделок</h2>
              <button onClick={() => setActiveTab('deals')} className="text-xs text-blue-400 flex items-center gap-1">
                Все <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2">
              {RE_DEAL_STAGES.filter(s => s.value !== 'lost').map(stage => {
                const count = dealsByStage[stage.value]?.length ?? 0;
                const value = dealsByStage[stage.value]?.reduce((s, d) => s + (d.deal_price ?? 0), 0) ?? 0;
                return (
                  <div key={stage.value}
                    onClick={() => { setActiveTab('deals'); setDealStageFilter(stage.value as REDealStage); }}
                    className="cursor-pointer flex items-center justify-between p-3 bg-slate-800/80 rounded-xl border border-slate-700/50 hover:border-slate-600 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-6 rounded-full ${stage.color}`} />
                      <span className="text-slate-200 text-sm">{stage.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {value > 0 && <span className="text-slate-400 text-xs">{fmtK(value)} ₽</span>}
                      <span className="text-white font-bold text-sm min-w-[20px] text-right">{count}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Hot clients */}
          {clients.filter(c => c.lead_score >= 70).length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-3">🔥 Горячие клиенты</h2>
              <div className="space-y-2">
                {clients.filter(c => c.lead_score >= 70).slice(0, 5).map(c => (
                  <div key={c.id} className="flex items-center justify-between p-3 bg-slate-800/80 rounded-xl border border-orange-500/20">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm truncate">{c.name}</p>
                      <p className="text-xs text-slate-400">
                        {CLIENT_TYPE_LABELS[c.client_type]} · {c.budget_max ? `до ${fmtK(c.budget_max)} ₽` : '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${leadScoreColor(c.lead_score)}`}>{c.lead_score}</span>
                      {c.phone && (
                        <a href={`tel:${c.phone}`} className="p-1.5 bg-green-500/20 rounded-lg">
                          <Phone className="w-3.5 h-3.5 text-green-400" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent tasks */}
          {tasks.filter(t => t.status === 'pending').slice(0, 5).length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-white">Ближайшие задачи</h2>
                <button onClick={() => setActiveTab('tasks')} className="text-xs text-blue-400 flex items-center gap-1">
                  Все <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-2">
                {tasks.filter(t => t.status === 'pending').slice(0, 5).map(t => (
                  <div key={t.id} className={`flex items-center gap-3 p-3 rounded-xl border ${
                    isOverdue(t.due_date) ? 'bg-red-500/10 border-red-500/30' : 'bg-slate-800/80 border-slate-700/50'
                  }`}>
                    <span className="text-lg">{TASK_TYPE_ICONS[t.task_type]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">{t.title}</p>
                      {t.due_date && (
                        <p className={`text-xs ${isOverdue(t.due_date) ? 'text-red-400' : 'text-slate-400'}`}>
                          {formatDateTime(t.due_date)}
                          {t.client_id && ` · ${getClientName(t.client_id)}`}
                        </p>
                      )}
                    </div>
                    <button onClick={() => handleCompleteTask(t.id)} className="p-1.5 bg-green-500/20 rounded-lg">
                      <Check className="w-3.5 h-3.5 text-green-400" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          2. CLIENTS
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'clients' && (
        <div className="p-4 space-y-4">
          {/* Search + Add */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Поиск клиентов..."
                className="w-full pl-9 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              onClick={() => setShowClientModal(true)}
              className="flex items-center gap-1.5 px-3 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-xl text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Добавить
            </button>
          </div>

          {/* Stage filter */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            <button
              onClick={() => setClientStageFilter('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                clientStageFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Все ({clients.length})
            </button>
            {RE_CLIENT_STAGES.map(s => {
              const count = clients.filter(c => c.stage === s.value).length;
              if (count === 0) return null;
              return (
                <button
                  key={s.value}
                  onClick={() => setClientStageFilter(s.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    clientStageFilter === s.value ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {s.label} ({count})
                </button>
              );
            })}
          </div>

          {/* Client list */}
          <div className="space-y-3">
            {filteredClients.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Клиентов не найдено</p>
                <button onClick={() => setShowClientModal(true)} className="mt-3 text-blue-400 text-sm">
                  + Добавить первого клиента
                </button>
              </div>
            ) : filteredClients.map(client => {
              const stageConf = RE_CLIENT_STAGES.find(s => s.value === client.stage);
              const sourceConf = RE_LEAD_SOURCES.find(s => s.value === client.source);
              return (
                <div key={client.id} className="bg-slate-800/80 rounded-2xl border border-slate-700/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-white font-semibold">{client.name}</h3>
                        <Badge className={`${stageConf?.color ?? 'bg-slate-600'} text-white`}>
                          {stageConf?.label ?? client.stage}
                        </Badge>
                        <Badge className="bg-slate-700 text-slate-300">
                          {CLIENT_TYPE_LABELS[client.client_type]}
                        </Badge>
                        {client.lead_score > 0 && (
                          <span className={`text-xs font-bold ${leadScoreColor(client.lead_score)}`}>
                            {leadScoreLabel(client.lead_score)} {client.lead_score}
                          </span>
                        )}
                      </div>

                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                        {client.phone && <span>📞 {client.phone}</span>}
                        {client.email && <span>✉️ {client.email}</span>}
                        {sourceConf && <span>{sourceConf.icon} {sourceConf.label}</span>}
                      </div>

                      {/* Requirements */}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {client.budget_max && (
                          <Badge className="bg-green-500/10 text-green-400 border border-green-500/20">
                            до {fmtK(client.budget_max)} ₽
                          </Badge>
                        )}
                        {client.rooms_min && (
                          <Badge className="bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            {client.rooms_min}{client.rooms_max && client.rooms_max !== client.rooms_min ? `-${client.rooms_max}` : ''}к
                          </Badge>
                        )}
                        {client.districts.slice(0, 2).map(d => (
                          <Badge key={d} className="bg-slate-700 text-slate-300">{d}</Badge>
                        ))}
                        {client.mortgage_ready && (
                          <Badge className="bg-purple-500/10 text-purple-400 border border-purple-500/20">🏦 Ипотека</Badge>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1.5">
                      {client.phone && (
                        <a href={`tel:${client.phone}`} className="p-2 bg-green-500/20 rounded-lg hover:bg-green-500/30 transition-colors">
                          <Phone className="w-4 h-4 text-green-400" />
                        </a>
                      )}
                      {client.whatsapp && (
                        <a href={`https://wa.me/${client.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                          className="p-2 bg-emerald-500/20 rounded-lg hover:bg-emerald-500/30 transition-colors">
                          <MessageSquare className="w-4 h-4 text-emerald-400" />
                        </a>
                      )}
                      {client.email && (
                        <a href={`mailto:${client.email}`} className="p-2 bg-blue-500/20 rounded-lg hover:bg-blue-500/30 transition-colors">
                          <Mail className="w-4 h-4 text-blue-400" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Stage change + actions */}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <select
                      value={client.stage}
                      onChange={e => handleUpdateClientStage(client.id, e.target.value as REClientStage)}
                      className="flex-1 min-w-0 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      {RE_CLIENT_STAGES.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleMatchProperties(client.id)}
                      disabled={matchingClientId === client.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-lg text-purple-400 text-xs transition-colors disabled:opacity-50"
                    >
                      <Target className="w-3.5 h-3.5" />
                      {matchingClientId === client.id ? '...' : 'Подбор'}
                    </button>
                    <button
                      onClick={() => handleDeleteClient(client.id)}
                      className="p-1.5 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          3. PROPERTIES
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'properties' && (
        <div className="p-4 space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Поиск объектов..."
                className="w-full pl-9 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              onClick={() => setShowPropertyModal(true)}
              className="flex items-center gap-1.5 px-3 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-xl text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Добавить
            </button>
          </div>

          {/* Status filter */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {(['all', 'available', 'reserved', 'sold', 'rented', 'off_market'] as const).map(s => {
              const count = s === 'all' ? properties.length : properties.filter(p => p.status === s).length;
              return (
                <button
                  key={s}
                  onClick={() => setPropertyStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    propertyStatusFilter === s ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {s === 'all' ? `Все (${count})` : `${PROPERTY_STATUS_LABELS[s]} (${count})`}
                </button>
              );
            })}
          </div>

          {/* Compare bar */}
          {compareIds.length > 0 && (
            <div className="flex items-center justify-between p-3 bg-purple-500/10 rounded-xl border border-purple-500/30">
              <span className="text-purple-400 text-sm">Сравнение: {compareIds.length} объекта</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCompareModal(true)}
                  className="px-3 py-1.5 bg-purple-600 rounded-lg text-white text-xs font-medium"
                >
                  Сравнить
                </button>
                <button onClick={() => setCompareIds([])} className="p-1.5 text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Property list */}
          <div className="space-y-3">
            {filteredProperties.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Home className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Объектов не найдено</p>
                <button onClick={() => setShowPropertyModal(true)} className="mt-3 text-blue-400 text-sm">
                  + Добавить первый объект
                </button>
              </div>
            ) : filteredProperties.map(prop => {
              const typeConf = RE_PROPERTY_TYPES.find(t => t.value === prop.property_type);
              const avm = getAVMEstimate(prop);
              const commission = getCommission(prop.price, prop.commission_pct);
              const isInCompare = compareIds.includes(prop.id);
              return (
                <div key={prop.id} className={`bg-slate-800/80 rounded-2xl border p-4 transition-colors ${
                  isInCompare ? 'border-purple-500/50' : 'border-slate-700/50'
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg">{typeConf?.icon ?? '🏠'}</span>
                        <h3 className="text-white font-semibold truncate">{prop.title}</h3>
                        <Badge className={`border ${PROPERTY_STATUS_COLORS[prop.status]}`}>
                          {PROPERTY_STATUS_LABELS[prop.status]}
                        </Badge>
                      </div>

                      {/* Price */}
                      <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-xl font-bold text-white">{fmt(prop.price)} ₽</span>
                        {prop.area_total && (
                          <span className="text-sm text-slate-400">
                            {fmt(Math.round(prop.price / prop.area_total))} ₽/м²
                          </span>
                        )}
                      </div>

                      {/* Details */}
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                        {prop.rooms && <span>🛏 {prop.rooms}к</span>}
                        {prop.area_total && <span>📐 {prop.area_total} м²</span>}
                        {prop.floor && prop.floors_total && <span>🏢 {prop.floor}/{prop.floors_total} эт</span>}
                        {prop.district && <span>📍 {prop.district}</span>}
                        {prop.metro_station && <span>🚇 {prop.metro_station}{prop.metro_distance ? ` ${prop.metro_distance} мин` : ''}</span>}
                      </div>

                      {/* AVM */}
                      {avm && avm.estimate > 0 && (
                        <div className="mt-2 p-2 bg-slate-700/50 rounded-lg">
                          <p className="text-xs text-slate-400">
                            АВМ оценка: <span className="text-white font-medium">{fmt(avm.estimate)} ₽</span>
                            <span className="text-slate-500"> ({fmt(avm.range_low)}–{fmt(avm.range_high)})</span>
                            <span className={`ml-1 ${avm.confidence === 'high' ? 'text-green-400' : avm.confidence === 'medium' ? 'text-yellow-400' : 'text-slate-500'}`}>
                              {avm.confidence === 'high' ? '●' : avm.confidence === 'medium' ? '◐' : '○'}
                            </span>
                          </p>
                          {prop.price > avm.range_high && (
                            <p className="text-xs text-orange-400 mt-0.5">⚠️ Цена выше рынка на {Math.round((prop.price / avm.estimate - 1) * 100)}%</p>
                          )}
                          {prop.price < avm.range_low && (
                            <p className="text-xs text-green-400 mt-0.5">✅ Цена ниже рынка на {Math.round((1 - prop.price / avm.estimate) * 100)}%</p>
                          )}
                        </div>
                      )}

                      {/* Commission */}
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="text-slate-400">
                          Комиссия {prop.commission_pct}%: <span className="text-green-400 font-medium">{fmt(commission.commission)} ₽</span>
                          <span className="text-slate-500"> (агент: {fmt(commission.agentShare)} ₽)</span>
                        </span>
                      </div>

                      {/* Multilisting badges */}
                      <div className="mt-2 flex gap-1.5 flex-wrap">
                        {prop.published_cian && <Badge className="bg-blue-500/10 text-blue-400 border border-blue-500/20">ЦИАН</Badge>}
                        {prop.published_avito && <Badge className="bg-green-500/10 text-green-400 border border-green-500/20">Авито</Badge>}
                        {prop.published_yandex && <Badge className="bg-red-500/10 text-red-400 border border-red-500/20">Яндекс</Badge>}
                        {prop.published_domclick && <Badge className="bg-orange-500/10 text-orange-400 border border-orange-500/20">Домклик</Badge>}
                        {prop.mortgage_possible && <Badge className="bg-purple-500/10 text-purple-400 border border-purple-500/20">🏦 Ипотека</Badge>}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <select
                      value={prop.status}
                      onChange={e => handleUpdatePropertyStatus(prop.id, e.target.value as REPropertyStatus)}
                      className="flex-1 min-w-0 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      {(['available', 'reserved', 'sold', 'rented', 'off_market'] as REPropertyStatus[]).map(s => (
                        <option key={s} value={s}>{PROPERTY_STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => toggleCompare(prop.id)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                        isInCompare
                          ? 'bg-purple-600 text-white'
                          : 'bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-400'
                      }`}
                    >
                      <BarChart2 className="w-3.5 h-3.5" />
                      {isInCompare ? 'В сравнении' : 'Сравнить'}
                    </button>
                    <button
                      onClick={() => handleDeleteProperty(prop.id)}
                      className="p-1.5 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          4. DEALS — Kanban
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'deals' && (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => setKanbanView(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${kanbanView ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}
              >
                Kanban
              </button>
              <button
                onClick={() => setKanbanView(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!kanbanView ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}
              >
                Список
              </button>
            </div>
            <button
              onClick={() => setShowDealModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Сделка
            </button>
          </div>

          {kanbanView ? (
            /* Kanban */
            <div className="space-y-4">
              {RE_DEAL_STAGES.map(stage => {
                const stageDeals = dealsByStage[stage.value] ?? [];
                if (stageDeals.length === 0 && stage.value === 'lost') return null;
                return (
                  <div key={stage.value}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-3 h-3 rounded-full ${stage.color}`} />
                      <span className="text-slate-300 text-sm font-medium">{stage.label}</span>
                      <span className="text-slate-500 text-xs">({stageDeals.length})</span>
                      {stageDeals.length > 0 && (
                        <span className="text-slate-500 text-xs ml-auto">
                          {fmtK(stageDeals.reduce((s, d) => s + (d.deal_price ?? 0), 0))} ₽
                        </span>
                      )}
                    </div>
                    {stageDeals.length === 0 ? (
                      <div className="p-3 border border-dashed border-slate-700 rounded-xl text-center text-slate-600 text-xs">
                        Нет сделок
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {stageDeals.map(deal => (
                          <div key={deal.id} className="bg-slate-800/80 rounded-xl border border-slate-700/50 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-white font-medium text-sm truncate">{deal.title}</p>
                                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-slate-400">
                                  {deal.client_id && <span>👤 {getClientName(deal.client_id)}</span>}
                                  {deal.property_id && <span>🏠 {getPropertyTitle(deal.property_id)}</span>}
                                  {deal.deal_price && <span className="text-green-400 font-medium">{fmtK(deal.deal_price)} ₽</span>}
                                  {deal.commission_amount && <span className="text-emerald-400">К: {fmtK(deal.commission_amount)} ₽</span>}
                                </div>
                                {deal.mortgage_bank && (
                                  <p className="text-xs text-purple-400 mt-0.5">🏦 {deal.mortgage_bank} {deal.mortgage_rate}%</p>
                                )}
                              </div>
                              <button
                                onClick={() => handleDeleteDeal(deal.id)}
                                className="p-1 text-slate-600 hover:text-red-400 transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            {/* Move buttons */}
                            <div className="mt-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
                              {RE_DEAL_STAGES.filter(s => s.value !== stage.value).map(s => (
                                <button
                                  key={s.value}
                                  onClick={() => handleMoveDeal(deal.id, s.value)}
                                  className={`px-2 py-1 rounded-lg text-xs whitespace-nowrap transition-colors ${s.color} text-white opacity-70 hover:opacity-100`}
                                >
                                  → {s.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* List view */
            <div className="space-y-3">
              {/* Stage filter */}
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                <button
                  onClick={() => setDealStageFilter('all')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${dealStageFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                >
                  Все ({deals.length})
                </button>
                {RE_DEAL_STAGES.map(s => {
                  const count = dealsByStage[s.value]?.length ?? 0;
                  if (count === 0) return null;
                  return (
                    <button key={s.value}
                      onClick={() => setDealStageFilter(s.value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${dealStageFilter === s.value ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                    >
                      {s.label} ({count})
                    </button>
                  );
                })}
              </div>
              {filteredDeals.map(deal => {
                const stageConf = RE_DEAL_STAGES.find(s => s.value === deal.stage);
                return (
                  <div key={deal.id} className="bg-slate-800/80 rounded-2xl border border-slate-700/50 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-white font-semibold">{deal.title}</h3>
                          <Badge className={`${stageConf?.color ?? 'bg-slate-600'} text-white`}>{stageConf?.label}</Badge>
                          <Badge className="bg-slate-700 text-slate-300">{deal.deal_type === 'sale' ? 'Продажа' : deal.deal_type === 'rent' ? 'Аренда' : 'Ипотека'}</Badge>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                          {deal.client_id && <span>👤 {getClientName(deal.client_id)}</span>}
                          {deal.property_id && <span>🏠 {getPropertyTitle(deal.property_id)}</span>}
                          {deal.deal_price && <span className="text-green-400 font-medium">{fmt(deal.deal_price)} ₽</span>}
                          {deal.commission_amount && <span className="text-emerald-400">Комиссия: {fmt(deal.commission_amount)} ₽</span>}
                        </div>
                        {deal.mortgage_bank && (
                          <p className="text-xs text-purple-400 mt-1">
                            🏦 {deal.mortgage_bank} · {deal.mortgage_rate}% · {deal.mortgage_term} лет
                            {deal.mortgage_approved && ' · ✅ Одобрено'}
                          </p>
                        )}
                      </div>
                      <button onClick={() => handleDeleteDeal(deal.id)} className="p-1.5 text-slate-600 hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="mt-3">
                      <select
                        value={deal.stage}
                        onChange={e => handleMoveDeal(deal.id, e.target.value as REDealStage)}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                      >
                        {RE_DEAL_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          5. SHOWINGS
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'showings' && (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Показы</h2>
            <button
              onClick={() => setShowShowingModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Запланировать
            </button>
          </div>

          {/* Today */}
          {todayShowings.length > 0 && (
            <div className="p-3 bg-cyan-500/10 rounded-xl border border-cyan-500/30">
              <p className="text-cyan-400 text-sm font-medium mb-2">📅 Сегодня: {todayShowings.length} показов</p>
              {todayShowings.map(s => (
                <div key={s.id} className="flex items-center gap-2 text-xs text-slate-300 py-1">
                  <span className="text-cyan-400 font-medium">{formatDateTime(s.scheduled_at)}</span>
                  <span>{getPropertyTitle(s.property_id)}</span>
                  <span className="text-slate-500">·</span>
                  <span>{getClientName(s.client_id)}</span>
                </div>
              ))}
            </div>
          )}

          {/* All showings */}
          <div className="space-y-3">
            {showings.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Eye className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Показов не запланировано</p>
              </div>
            ) : showings.map(showing => {
              const statusColors: Record<string, string> = {
                scheduled: 'text-blue-400 bg-blue-400/10',
                completed: 'text-green-400 bg-green-400/10',
                cancelled: 'text-red-400 bg-red-400/10',
                no_show:   'text-orange-400 bg-orange-400/10',
                rescheduled: 'text-yellow-400 bg-yellow-400/10',
              };
              return (
                <div key={showing.id} className="bg-slate-800/80 rounded-2xl border border-slate-700/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-semibold text-sm">{formatDateTime(showing.scheduled_at)}</span>
                        <Badge className={statusColors[showing.status] ?? 'text-slate-400 bg-slate-400/10'}>
                          {showing.status === 'scheduled' ? 'Запланирован' :
                           showing.status === 'completed' ? 'Завершён' :
                           showing.status === 'cancelled' ? 'Отменён' :
                           showing.status === 'no_show' ? 'Не явился' : 'Перенесён'}
                        </Badge>
                        <span className="text-slate-400 text-xs">{showing.duration_min} мин</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                        {showing.property_id && <span>🏠 {getPropertyTitle(showing.property_id)}</span>}
                        {showing.client_id && <span>👤 {getClientName(showing.client_id)}</span>}
                      </div>
                      {showing.client_feedback && (
                        <p className={`text-xs mt-1 ${FEEDBACK_LABELS[showing.client_feedback]?.color ?? 'text-slate-400'}`}>
                          {FEEDBACK_LABELS[showing.client_feedback]?.label}
                        </p>
                      )}
                      {showing.agent_notes && (
                        <p className="text-xs text-slate-500 mt-1 italic">{showing.agent_notes}</p>
                      )}
                    </div>
                  </div>

                  {/* Complete showing */}
                  {showing.status === 'scheduled' && (
                    <div className="mt-3">
                      <p className="text-xs text-slate-400 mb-2">Результат показа:</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {(['very_interested', 'interested', 'neutral', 'not_interested', 'rejected'] as const).map(fb => (
                          <button
                            key={fb}
                            onClick={() => handleCompleteShowing(showing.id, fb)}
                            className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs text-slate-300 transition-colors"
                          >
                            {FEEDBACK_LABELS[fb]?.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          6. TASKS
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'tasks' && (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Задачи</h2>
            <button
              onClick={() => setShowTaskModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Задача
            </button>
          </div>

          {overdueTasks.length > 0 && (
            <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/30">
              <p className="text-red-400 text-sm font-medium">⚠️ Просрочено: {overdueTasks.length} задач</p>
            </div>
          )}

          <div className="space-y-2">
            {tasks.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Задач нет</p>
              </div>
            ) : tasks.map(task => (
              <div key={task.id} className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                task.status === 'completed' ? 'bg-slate-800/40 border-slate-700/30 opacity-60' :
                isOverdue(task.due_date) ? 'bg-red-500/10 border-red-500/30' :
                'bg-slate-800/80 border-slate-700/50'
              }`}>
                <button
                  onClick={() => task.status !== 'completed' && handleCompleteTask(task.id)}
                  className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    task.status === 'completed'
                      ? 'bg-green-500 border-green-500'
                      : 'border-slate-600 hover:border-green-500'
                  }`}
                >
                  {task.status === 'completed' && <Check className="w-3 h-3 text-white" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base">{TASK_TYPE_ICONS[task.task_type]}</span>
                    <span className={`text-sm ${task.status === 'completed' ? 'line-through text-slate-500' : 'text-white'}`}>
                      {task.title}
                    </span>
                    <Badge className={PRIORITY_COLORS[task.priority]}>
                      {PRIORITY_LABELS[task.priority]}
                    </Badge>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-slate-400">
                    {task.due_date && (
                      <span className={isOverdue(task.due_date) && task.status !== 'completed' ? 'text-red-400' : ''}>
                        📅 {formatDateTime(task.due_date)}
                      </span>
                    )}
                    {task.client_id && <span>👤 {getClientName(task.client_id)}</span>}
                    {task.property_id && <span>🏠 {getPropertyTitle(task.property_id)}</span>}
                  </div>
                </div>
                <button
                  onClick={() => { crmRE.deleteTask(task.id); setTasks(prev => prev.filter(t => t.id !== task.id)); }}
                  className="p-1 text-slate-600 hover:text-red-400 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          7. DOCUMENTS
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'documents' && (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Документы</h2>
            <button
              onClick={() => setShowDocModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Документ
            </button>
          </div>

          {/* Document checklist by type */}
          <div className="space-y-2">
            {RE_DOC_TYPES.map(dt => {
              const docs = documents.filter(d => d.doc_type === dt.value);
              return (
                <div key={dt.value} className="bg-slate-800/80 rounded-xl border border-slate-700/50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 text-sm">{dt.label}</span>
                    <span className={`text-xs font-medium ${docs.length > 0 ? 'text-green-400' : 'text-slate-500'}`}>
                      {docs.length > 0 ? `✓ ${docs.length}` : '—'}
                    </span>
                  </div>
                  {docs.map(doc => (
                    <div key={doc.id} className="mt-2 flex items-center gap-2 text-xs text-slate-400 pl-2 border-l border-slate-700">
                      <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="flex-1 truncate">{doc.title}</span>
                      {doc.signed && <span className="text-green-400">✓ Подписан</span>}
                      {doc.deal_id && <span className="text-slate-500">{deals.find(d => d.id === doc.deal_id)?.title}</span>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {documents.length === 0 && (
            <div className="text-center py-8 text-slate-400">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Документов нет</p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          8. MORTGAGE CALCULATOR
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'mortgage' && (
        <div className="p-4 space-y-5">
          <h2 className="text-lg font-semibold text-white">🏦 Ипотечный калькулятор</h2>

          <div className="bg-slate-800/80 rounded-2xl border border-slate-700/50 p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Стоимость объекта, ₽</label>
                <input
                  type="number"
                  value={mortgageCalc.price}
                  onChange={e => setMortgageCalc(p => ({ ...p, price: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Первоначальный взнос, %</label>
                <input
                  type="number"
                  value={mortgageCalc.down_pct}
                  onChange={e => setMortgageCalc(p => ({ ...p, down_pct: e.target.value }))}
                  min="10" max="90"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Ставка, % годовых</label>
                <input
                  type="number"
                  value={mortgageCalc.rate}
                  onChange={e => setMortgageCalc(p => ({ ...p, rate: e.target.value }))}
                  step="0.1"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Срок, лет</label>
                <input
                  type="number"
                  value={mortgageCalc.term}
                  onChange={e => setMortgageCalc(p => ({ ...p, term: e.target.value }))}
                  min="1" max="30"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Bank selector */}
            <div>
              <label className="text-xs text-slate-400 mb-2 block">Банк</label>
              <div className="grid grid-cols-2 gap-2">
                {RE_MORTGAGE_BANKS.map(bank => (
                  <button
                    key={bank.name}
                    onClick={() => setMortgageCalc(p => ({ ...p, bank: bank.name, rate: String(bank.rate) }))}
                    className={`p-2 rounded-lg border text-left transition-colors ${
                      mortgageCalc.bank === bank.name
                        ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
                        : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <p className="text-xs font-medium">{bank.name}</p>
                    <p className="text-xs text-slate-400">{bank.rate}% · от {bank.min_down}%</p>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleCalcMortgage}
              disabled={calcLoading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl text-white font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Calculator className="w-4 h-4" />
              {calcLoading ? 'Считаем...' : 'Рассчитать'}
            </button>
          </div>

          {/* Result */}
          {mortgageResult && (
            <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-2xl border border-blue-500/30 p-4 space-y-3">
              <h3 className="text-white font-semibold">Результат расчёта</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/60 rounded-xl p-3">
                  <p className="text-xs text-slate-400">Ежемесячный платёж</p>
                  <p className="text-xl font-bold text-white">{fmt(mortgageResult.monthly_payment)} ₽</p>
                </div>
                <div className="bg-slate-800/60 rounded-xl p-3">
                  <p className="text-xs text-slate-400">Сумма кредита</p>
                  <p className="text-xl font-bold text-blue-400">{fmtM(mortgageResult.loan_amount)}</p>
                </div>
                <div className="bg-slate-800/60 rounded-xl p-3">
                  <p className="text-xs text-slate-400">Первоначальный взнос</p>
                  <p className="text-lg font-bold text-green-400">{fmtM(mortgageResult.down_payment)}</p>
                </div>
                <div className="bg-slate-800/60 rounded-xl p-3">
                  <p className="text-xs text-slate-400">Переплата</p>
                  <p className="text-lg font-bold text-orange-400">{fmtM(mortgageResult.overpayment)}</p>
                </div>
              </div>
              <div className="p-3 bg-slate-800/60 rounded-xl">
                <p className="text-xs text-slate-400">Итого выплат</p>
                <p className="text-lg font-bold text-white">{fmtM(mortgageResult.total_payment)}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Переплата составит {Math.round(mortgageResult.overpayment / mortgageResult.loan_amount * 100)}% от суммы кредита
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          9. ANALYTICS — Districts
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'analytics' && (
        <div className="p-4 space-y-5">
          <h2 className="text-lg font-semibold text-white">📈 Аналитика рынка</h2>

          {/* Summary */}
          {districtAnalytics.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800/80 rounded-2xl border border-slate-700/50 p-4">
                <p className="text-xs text-slate-400">Средняя цена/м² (Москва)</p>
                <p className="text-xl font-bold text-white">
                  {fmt(Math.round(districtAnalytics.reduce((s, d) => s + d.avg_price_sqm, 0) / districtAnalytics.length))} ₽
                </p>
              </div>
              <div className="bg-slate-800/80 rounded-2xl border border-slate-700/50 p-4">
                <p className="text-xs text-slate-400">Среднее время продажи</p>
                <p className="text-xl font-bold text-white">
                  {Math.round(districtAnalytics.reduce((s, d) => s + d.days_on_market, 0) / districtAnalytics.length)} дней
                </p>
              </div>
            </div>
          )}

          {/* District table */}
          <div className="space-y-2">
            {districtAnalytics.map(da => (
              <div key={da.id} className="bg-slate-800/80 rounded-2xl border border-slate-700/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-white font-semibold">{da.district}</h3>
                      <span className={`text-xs font-medium ${da.price_trend_pct > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {da.price_trend_pct > 0 ? '↑' : '↓'} {Math.abs(da.price_trend_pct)}%/мес
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-slate-500">1к</p>
                        <p className="text-white font-medium">{fmtK(da.avg_price_sqm_1r)} ₽/м²</p>
                      </div>
                      <div>
                        <p className="text-slate-500">2к</p>
                        <p className="text-white font-medium">{fmtK(da.avg_price_sqm_2r)} ₽/м²</p>
                      </div>
                      <div>
                        <p className="text-slate-500">3к+</p>
                        <p className="text-white font-medium">{fmtK(da.avg_price_sqm_3r)} ₽/м²</p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                      <span>📋 {da.listings_count} объявлений</span>
                      <span>⏱ {da.days_on_market} дней</span>
                    </div>
                    {/* Infrastructure */}
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>🏫 {da.infrastructure.schools} школ</span>
                      <span>🏥 {da.infrastructure.hospitals} больниц</span>
                      <span>🛒 {da.infrastructure.malls} ТЦ</span>
                      <span>🌳 {da.infrastructure.parks} парков</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Средняя</p>
                    <p className="text-lg font-bold text-white">{fmtK(da.avg_price_sqm)}</p>
                    <p className="text-xs text-slate-500">₽/м²</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {districtAnalytics.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Данные аналитики загружаются...</p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          10. MATCHING — Auto property selection
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'matching' && (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">🎯 Автоподбор объектов</h2>
          </div>

          {/* Client selector */}
          <div>
            <label className="text-xs text-slate-400 mb-2 block">Выберите клиента для подбора:</label>
            <div className="space-y-2">
              {clients.filter(c => c.client_type === 'buyer' || c.client_type === 'tenant').map(c => (
                <button
                  key={c.id}
                  onClick={() => handleMatchProperties(c.id)}
                  disabled={matchingClientId === c.id}
                  className="w-full flex items-center justify-between p-3 bg-slate-800/80 rounded-xl border border-slate-700/50 hover:border-blue-500/50 transition-colors disabled:opacity-50"
                >
                  <div className="text-left">
                    <p className="text-white text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-slate-400">
                      {CLIENT_TYPE_LABELS[c.client_type]}
                      {c.budget_max ? ` · до ${fmtK(c.budget_max)} ₽` : ''}
                      {c.rooms_min ? ` · ${c.rooms_min}к` : ''}
                      {c.districts.length > 0 ? ` · ${c.districts.slice(0, 2).join(', ')}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${leadScoreColor(c.lead_score)}`}>{c.lead_score}</span>
                    <Target className="w-4 h-4 text-purple-400" />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Results */}
          {matchedProperties.length > 0 && (
            <div>
              <h3 className="text-white font-semibold mb-3">Найдено {matchedProperties.length} объектов</h3>
              <div className="space-y-3">
                {matchedProperties.map(mp => {
                  const prop = properties.find(p => p.id === mp.property_id);
                  return (
                    <div key={mp.property_id} className="bg-slate-800/80 rounded-2xl border border-slate-700/50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-white font-medium text-sm truncate">{mp.title}</h4>
                            <div className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              mp.match_score >= 80 ? 'bg-green-500/20 text-green-400' :
                              mp.match_score >= 60 ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-slate-700 text-slate-400'
                            }`}>
                              {mp.match_score}%
                            </div>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400">
                            <span className="text-white font-medium">{fmt(mp.price)} ₽</span>
                            {mp.area_total && <span>{mp.area_total} м²</span>}
                            {mp.rooms && <span>{mp.rooms}к</span>}
                            {mp.district && <span>📍 {mp.district}</span>}
                          </div>
                          {/* Match score bar */}
                          <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                mp.match_score >= 80 ? 'bg-green-500' :
                                mp.match_score >= 60 ? 'bg-yellow-500' : 'bg-slate-500'
                              }`}
                              style={{ width: `${mp.match_score}%` }}
                            />
                          </div>
                        </div>
                        {prop && (
                          <button
                            onClick={() => { setActiveTab('properties'); }}
                            className="p-2 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30 transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {matchedProperties.length === 0 && clients.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <Target className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Добавьте клиентов с требованиями для автоподбора</p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODALS
      ══════════════════════════════════════════════════════════ */}

      {/* Add Client Modal */}
      {showClientModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 rounded-t-3xl border-t border-slate-700 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-white">Новый клиент</h3>
              <button onClick={() => setShowClientModal(false)} className="p-2 rounded-full hover:bg-slate-800">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="space-y-3">
              <input value={clientForm.name} onChange={e => setClientForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Имя клиента *" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
              <div className="grid grid-cols-2 gap-3">
                <input value={clientForm.phone} onChange={e => setClientForm(p => ({ ...p, phone: e.target.value }))}
                  placeholder="Телефон" type="tel" className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
                <input value={clientForm.email} onChange={e => setClientForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="Email" type="email" className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input value={clientForm.telegram} onChange={e => setClientForm(p => ({ ...p, telegram: e.target.value }))}
                  placeholder="Telegram" className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
                <input value={clientForm.whatsapp} onChange={e => setClientForm(p => ({ ...p, whatsapp: e.target.value }))}
                  placeholder="WhatsApp" className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select value={clientForm.client_type} onChange={e => setClientForm(p => ({ ...p, client_type: e.target.value as REClient['client_type'] }))}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500">
                  {Object.entries(CLIENT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <select value={clientForm.deal_type} onChange={e => setClientForm(p => ({ ...p, deal_type: e.target.value as REClient['deal_type'] }))}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500">
                  <option value="sale">Покупка</option>
                  <option value="rent">Аренда</option>
                  <option value="mortgage">Ипотека</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input value={clientForm.budget_min} onChange={e => setClientForm(p => ({ ...p, budget_min: e.target.value }))}
                  placeholder="Бюджет от, ₽" type="number" className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
                <input value={clientForm.budget_max} onChange={e => setClientForm(p => ({ ...p, budget_max: e.target.value }))}
                  placeholder="Бюджет до, ₽" type="number" className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input value={clientForm.rooms_min} onChange={e => setClientForm(p => ({ ...p, rooms_min: e.target.value }))}
                  placeholder="Комнат от" type="number" className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
                <input value={clientForm.rooms_max} onChange={e => setClientForm(p => ({ ...p, rooms_max: e.target.value }))}
                  placeholder="Комнат до" type="number" className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <select value={clientForm.source} onChange={e => setClientForm(p => ({ ...p, source: e.target.value as REClient['source'] }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500">
                {RE_LEAD_SOURCES.map(s => <option key={s.value} value={s.value}>{s.icon} {s.label}</option>)}
              </select>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={clientForm.mortgage_ready} onChange={e => setClientForm(p => ({ ...p, mortgage_ready: e.target.checked }))}
                  className="w-4 h-4 rounded" />
                <span className="text-slate-300 text-sm">🏦 Готов к ипотеке</span>
              </label>
              <textarea value={clientForm.notes} onChange={e => setClientForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Заметки..." rows={2}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
              <button onClick={handleCreateClient}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-xl text-white font-medium transition-colors">
                Добавить клиента
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Property Modal */}
      {showPropertyModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 rounded-t-3xl border-t border-slate-700 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-white">Новый объект</h3>
              <button onClick={() => setShowPropertyModal(false)} className="p-2 rounded-full hover:bg-slate-800">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="space-y-3">
              <input value={propertyForm.title} onChange={e => setPropertyForm(p => ({ ...p, title: e.target.value }))}
                placeholder="Название объекта *" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
              <div className="grid grid-cols-2 gap-3">
                <select value={propertyForm.property_type} onChange={e => setPropertyForm(p => ({ ...p, property_type: e.target.value as REProperty['property_type'] }))}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500">
                  {RE_PROPERTY_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
                <select value={propertyForm.deal_type} onChange={e => setPropertyForm(p => ({ ...p, deal_type: e.target.value as REProperty['deal_type'] }))}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500">
                  <option value="sale">Продажа</option>
                  <option value="rent">Аренда</option>
                </select>
              </div>
              <input value={propertyForm.address} onChange={e => setPropertyForm(p => ({ ...p, address: e.target.value }))}
                placeholder="Адрес" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
              <div className="grid grid-cols-2 gap-3">
                <input value={propertyForm.district} onChange={e => setPropertyForm(p => ({ ...p, district: e.target.value }))}
                  placeholder="Район" className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
                <input value={propertyForm.metro_station} onChange={e => setPropertyForm(p => ({ ...p, metro_station: e.target.value }))}
                  placeholder="Метро" className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <input value={propertyForm.rooms} onChange={e => setPropertyForm(p => ({ ...p, rooms: e.target.value }))}
                  placeholder="Комнат" type="number" className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
                <input value={propertyForm.area_total} onChange={e => setPropertyForm(p => ({ ...p, area_total: e.target.value }))}
                  placeholder="Площадь м²" type="number" className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
                <input value={propertyForm.floor} onChange={e => setPropertyForm(p => ({ ...p, floor: e.target.value }))}
                  placeholder="Этаж" type="number" className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <input value={propertyForm.price} onChange={e => setPropertyForm(p => ({ ...p, price: e.target.value }))}
                placeholder="Цена, ₽ *" type="number" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
              <div className="grid grid-cols-2 gap-3">
                <input value={propertyForm.commission_pct} onChange={e => setPropertyForm(p => ({ ...p, commission_pct: e.target.value }))}
                  placeholder="Комиссия %" type="number" step="0.5" className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
                <select value={propertyForm.commission_who} onChange={e => setPropertyForm(p => ({ ...p, commission_who: e.target.value as REProperty['commission_who'] }))}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500">
                  <option value="buyer">Платит покупатель</option>
                  <option value="seller">Платит продавец</option>
                  <option value="split">Пополам</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input value={propertyForm.seller_name} onChange={e => setPropertyForm(p => ({ ...p, seller_name: e.target.value }))}
                  placeholder="Имя продавца" className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
                <input value={propertyForm.seller_phone} onChange={e => setPropertyForm(p => ({ ...p, seller_phone: e.target.value }))}
                  placeholder="Телефон продавца" className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
              {/* Multilisting */}
              <div>
                <p className="text-xs text-slate-400 mb-2">Публикация на площадках:</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'published_cian', label: 'ЦИАН' },
                    { key: 'published_avito', label: 'Авито' },
                    { key: 'published_yandex', label: 'Яндекс.Недв' },
                    { key: 'published_domclick', label: 'Домклик' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox"
                        checked={propertyForm[key as keyof typeof propertyForm] as boolean}
                        onChange={e => setPropertyForm(p => ({ ...p, [key]: e.target.checked }))}
                        className="w-4 h-4 rounded" />
                      <span className="text-slate-300 text-sm">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={propertyForm.mortgage_possible} onChange={e => setPropertyForm(p => ({ ...p, mortgage_possible: e.target.checked }))}
                  className="w-4 h-4 rounded" />
                <span className="text-slate-300 text-sm">🏦 Возможна ипотека</span>
              </label>
              <textarea value={propertyForm.description} onChange={e => setPropertyForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Описание объекта..." rows={3}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
              <button onClick={handleCreateProperty}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-xl text-white font-medium transition-colors">
                Добавить объект
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Deal Modal */}
      {showDealModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 rounded-t-3xl border-t border-slate-700 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-white">Новая сделка</h3>
              <button onClick={() => setShowDealModal(false)} className="p-2 rounded-full hover:bg-slate-800">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="space-y-3">
              <input value={dealForm.title} onChange={e => setDealForm(p => ({ ...p, title: e.target.value }))}
                placeholder="Название сделки *" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
              <div className="grid grid-cols-2 gap-3">
                <select value={dealForm.deal_type} onChange={e => setDealForm(p => ({ ...p, deal_type: e.target.value as REDeal['deal_type'] }))}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500">
                  <option value="sale">Продажа</option>
                  <option value="rent">Аренда</option>
                  <option value="mortgage">Ипотека</option>
                  <option value="exchange">Обмен</option>
                </select>
                <select value={dealForm.stage} onChange={e => setDealForm(p => ({ ...p, stage: e.target.value as REDealStage }))}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500">
                  {RE_DEAL_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <select value={dealForm.client_id} onChange={e => setDealForm(p => ({ ...p, client_id: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="">— Клиент —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={dealForm.property_id} onChange={e => setDealForm(p => ({ ...p, property_id: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="">— Объект —</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.title} · {fmt(p.price)} ₽</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input value={dealForm.deal_price} onChange={e => setDealForm(p => ({ ...p, deal_price: e.target.value }))}
                  placeholder="Сумма сделки, ₽" type="number" className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
                <input value={dealForm.commission_pct} onChange={e => setDealForm(p => ({ ...p, commission_pct: e.target.value }))}
                  placeholder="Комиссия %" type="number" step="0.5" className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
              {/* Mortgage fields */}
              {dealForm.deal_type === 'mortgage' && (
                <div className="space-y-3 p-3 bg-purple-500/10 rounded-xl border border-purple-500/20">
                  <p className="text-purple-400 text-xs font-medium">🏦 Ипотека</p>
                  <select value={dealForm.mortgage_bank} onChange={e => {
                    const bank = RE_MORTGAGE_BANKS.find(b => b.name === e.target.value);
                    setDealForm(p => ({ ...p, mortgage_bank: e.target.value, mortgage_rate: bank ? String(bank.rate) : p.mortgage_rate }));
                  }}
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500">
                    <option value="">— Банк —</option>
                    {RE_MORTGAGE_BANKS.map(b => <option key={b.name} value={b.name}>{b.name} · {b.rate}%</option>)}
                  </select>
                  <div className="grid grid-cols-3 gap-2">
                    <input value={dealForm.mortgage_amount} onChange={e => setDealForm(p => ({ ...p, mortgage_amount: e.target.value }))}
                      placeholder="Сумма" type="number" className="bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                    <input value={dealForm.mortgage_rate} onChange={e => setDealForm(p => ({ ...p, mortgage_rate: e.target.value }))}
                      placeholder="Ставка %" type="number" step="0.1" className="bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                    <input value={dealForm.mortgage_term} onChange={e => setDealForm(p => ({ ...p, mortgage_term: e.target.value }))}
                      placeholder="Лет" type="number" className="bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
              )}
              <textarea value={dealForm.notes} onChange={e => setDealForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Заметки..." rows={2}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
              <button onClick={handleCreateDeal}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-xl text-white font-medium transition-colors">
                Создать сделку
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Showing Modal */}
      {showShowingModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 rounded-t-3xl border-t border-slate-700 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-white">Запланировать показ</h3>
              <button onClick={() => setShowShowingModal(false)} className="p-2 rounded-full hover:bg-slate-800">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="space-y-3">
              <input value={showingForm.scheduled_at} onChange={e => setShowingForm(p => ({ ...p, scheduled_at: e.target.value }))}
                type="datetime-local" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
              <select value={showingForm.client_id} onChange={e => setShowingForm(p => ({ ...p, client_id: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="">— Клиент —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={showingForm.property_id} onChange={e => setShowingForm(p => ({ ...p, property_id: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="">— Объект —</option>
                {properties.filter(p => p.status === 'available').map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input value={showingForm.duration_min} onChange={e => setShowingForm(p => ({ ...p, duration_min: e.target.value }))}
                  placeholder="Длительность (мин)" type="number" className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <textarea value={showingForm.agent_notes} onChange={e => setShowingForm(p => ({ ...p, agent_notes: e.target.value }))}
                placeholder="Заметки агента..." rows={2}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
              <button onClick={handleCreateShowing}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-xl text-white font-medium transition-colors">
                Запланировать
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 rounded-t-3xl border-t border-slate-700 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-white">Новая задача</h3>
              <button onClick={() => setShowTaskModal(false)} className="p-2 rounded-full hover:bg-slate-800">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="space-y-3">
              <input value={taskForm.title} onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))}
                placeholder="Название задачи *" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
              <div className="grid grid-cols-2 gap-3">
                <select value={taskForm.task_type} onChange={e => setTaskForm(p => ({ ...p, task_type: e.target.value as RETask['task_type'] }))}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500">
                  {Object.entries(TASK_TYPE_ICONS).map(([v, icon]) => (
                    <option key={v} value={v}>{icon} {v === 'call' ? 'Звонок' : v === 'email' ? 'Email' : v === 'whatsapp' ? 'WhatsApp' : v === 'meeting' ? 'Встреча' : v === 'showing' ? 'Показ' : v === 'document' ? 'Документ' : 'Другое'}</option>
                  ))}
                </select>
                <select value={taskForm.priority} onChange={e => setTaskForm(p => ({ ...p, priority: e.target.value as RETask['priority'] }))}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500">
                  {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <input value={taskForm.due_date} onChange={e => setTaskForm(p => ({ ...p, due_date: e.target.value }))}
                type="datetime-local" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
              <select value={taskForm.client_id} onChange={e => setTaskForm(p => ({ ...p, client_id: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="">— Клиент (опционально) —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={taskForm.property_id} onChange={e => setTaskForm(p => ({ ...p, property_id: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="">— Объект (опционально) —</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              <textarea value={taskForm.notes} onChange={e => setTaskForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Заметки..." rows={2}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
              <button onClick={handleCreateTask}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-xl text-white font-medium transition-colors">
                Создать задачу
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Document Modal */}
      {showDocModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 rounded-t-3xl border-t border-slate-700 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-white">Новый документ</h3>
              <button onClick={() => setShowDocModal(false)} className="p-2 rounded-full hover:bg-slate-800">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="space-y-3">
              <select value={docForm.doc_type} onChange={e => setDocForm(p => ({ ...p, doc_type: e.target.value as REDocument['doc_type'] }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500">
                {RE_DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
              <input value={docForm.title} onChange={e => setDocForm(p => ({ ...p, title: e.target.value }))}
                placeholder="Название документа *" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
              <select value={docForm.deal_id} onChange={e => setDocForm(p => ({ ...p, deal_id: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="">— Сделка (опционально) —</option>
                {deals.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
              <select value={docForm.client_id} onChange={e => setDocForm(p => ({ ...p, client_id: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="">— Клиент (опционально) —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <textarea value={docForm.notes} onChange={e => setDocForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Заметки..." rows={2}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
              <button onClick={handleCreateDocument}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-xl text-white font-medium transition-colors">
                Добавить документ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compare Modal */}
      {showCompareModal && compareProperties.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-slate-900 rounded-t-3xl border-t border-slate-700 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-white">Сравнение объектов</h3>
              <button onClick={() => setShowCompareModal(false)} className="p-2 rounded-full hover:bg-slate-800">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <td className="text-slate-400 text-xs py-2 pr-3 w-28">Параметр</td>
                    {compareProperties.map(p => (
                      <td key={p.id} className="text-white font-medium py-2 px-2 text-center">
                        <p className="truncate max-w-[120px]">{p.title}</p>
                      </td>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {(
                    [
                      { label: 'Цена', fn: (p: REProperty) => `${fmt(p.price)} ₽` },
                      { label: 'Цена/м²', fn: (p: REProperty) => p.area_total ? `${fmt(Math.round(p.price / p.area_total))} ₽` : '—' },
                      { label: 'Площадь', fn: (p: REProperty) => p.area_total ? `${p.area_total} м²` : '—' },
                      { label: 'Комнат', fn: (p: REProperty) => p.rooms ? String(p.rooms) : '—' },
                      { label: 'Этаж', fn: (p: REProperty) => p.floor && p.floors_total ? `${p.floor}/${p.floors_total}` : '—' },
                      { label: 'Район', fn: (p: REProperty) => p.district ?? '—' },
                      { label: 'Метро', fn: (p: REProperty) => p.metro_station ? `${p.metro_station}${p.metro_distance ? ` ${p.metro_distance}м` : ''}` : '—' },
                      { label: 'Год постройки', fn: (p: REProperty) => p.year_built ? String(p.year_built) : '—' },
                      { label: 'Ремонт', fn: (p: REProperty) => p.renovation ?? '—' },
                      { label: 'Ипотека', fn: (p: REProperty) => p.mortgage_possible ? '✅' : '❌' },
                      { label: 'Комиссия', fn: (p: REProperty) => `${p.commission_pct}%` },
                      { label: 'Статус', fn: (p: REProperty) => PROPERTY_STATUS_LABELS[p.status] },
                    ] as Array<{ label: string; fn: (p: REProperty) => string }>
                  ).map(row => (
                    <tr key={row.label}>
                      <td className="text-slate-400 text-xs py-2 pr-3">{row.label}</td>
                      {compareProperties.map(p => (
                        <td key={p.id} className="text-white text-xs py-2 px-2 text-center">{row.fn(p)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
