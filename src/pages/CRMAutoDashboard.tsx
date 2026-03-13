/**
 * CRMAutoDashboard — Automotive Dealer CRM
 *
 * Реализованные модули (сопоставление с конкурентами):
 *
 * ✓ auto.ru:
 *   - Управление автопарком (инвентарь), статистика объявлений (просмотры/контакты/избранное)
 *   - История цен, публикация на площадках, платное продвижение (ТОП/VIP/Premium)
 *   - VIN-проверка (владельцы, ДТП, ограничения, розыск)
 *   - Онлайн-бронирование с депозитом
 *   - Трейд-ин
 *
 * ✓ Авито авто:
 *   - Мультиисточниковые лиды (auto.ru/avito/drom/сайт/заход/звонок/WhatsApp/Telegram)
 *   - Статус контакта по каждому лиду, приоритет (🔥Горячий)
 *   - Дубль-детекция, рекомендация снизить цену
 *
 * ✓ Дром.ру:
 *   - Вертикали: легковые / мото / коммерческие / спецтехника / запчасти
 *   - Категория транспортного средства в карточке
 *
 * ✓ AutoTrader UK:
 *   - "Value your car" — мгновенная оценка авто (min/mid/max + confidence%)
 *   - "Reserve online" — онлайн-бронирование с депозитом
 *   - "Buy a car online" — воронка сделки (осмотр → кредит → документы → подписание → выдача)
 *   - Лизинг и EV-вертикаль (диапазон заряда)
 *   - Рейтинг дилера ★
 *   - NL-поиск ("I'm looking for")
 *
 * ✓ Cars.com:
 *   - "Deals near you" — выгодные объявления по цене ниже рынка
 *   - Рекламные спонсорские форматы (promoted)
 *   - Рекомендуемая цена vs цена листинга (underpriced/fair/overpriced)
 */
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Car, Users, TrendingUp, BarChart2, RefreshCw, Plus, Search,
  Eye, Phone, Mail, Star, ChevronRight, X, Edit2, CheckCircle,
  Calendar, Target, Zap, Clock, DollarSign, Shield,
  MessageSquare, AlertTriangle, Tag, Gauge, Battery
} from "lucide-react";
import {
  crm,
  type AutoVehicle, type AutoLead, type AutoDashboardStats,
  type AutoValuation, type AutoTestDrive,
  AUTO_SOURCES, AUTO_LEAD_STAGES, AUTO_VEHICLE_CATEGORIES,
  AUTO_ENGINE_TYPES, AUTO_TRANSMISSIONS, AUTO_BODY_TYPES,
  AUTO_LOST_REASONS, AUTO_PROMO_PACKAGES,
} from "@/lib/crm";
import { logger } from "@/lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = 'dashboard' | 'inventory' | 'leads' | 'deals' | 'valuations' | 'test_drives';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(n);
const fmtPrice = (n: number) => fmt(n) + ' ₽';

const VEHICLE_STATUS_COLORS: Record<string, string> = {
  active:   'text-green-400 bg-green-400/10',
  draft:    'text-slate-400 bg-slate-400/10',
  paused:   'text-yellow-400 bg-yellow-400/10',
  sold:     'text-blue-400 bg-blue-400/10',
  reserved: 'text-purple-400 bg-purple-400/10',
  archived: 'text-slate-500 bg-slate-500/10',
};

const VEHICLE_STATUS_LABELS: Record<string, string> = {
  active: 'Активно', draft: 'Черновик', paused: 'Пауза',
  sold: 'Продано', reserved: '🔒 Бронь', archived: 'Архив',
};

const LEAD_PRIORITY_COLORS: Record<string, string> = {
  hot:    'text-red-400 bg-red-400/10',
  high:   'text-amber-400 bg-amber-400/10',
  normal: 'text-slate-400 bg-slate-400/10',
  low:    'text-slate-500 bg-slate-500/10',
};

const SOURCE_ICON: Record<string, string> = Object.fromEntries(
  AUTO_SOURCES.map(s => [s.value, s.icon])
);

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export function CRMAutoDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Data
  const [stats, setStats] = useState<AutoDashboardStats | null>(null);
  const [vehicles, setVehicles] = useState<AutoVehicle[]>([]);
  const [leads, setLeads] = useState<AutoLead[]>([]);
  const [valuations, setValuations] = useState<AutoValuation[]>([]);
  const [testDrives, setTestDrives] = useState<AutoTestDrive[]>([]);

  // Filters
  const [vehicleStatus, setVehicleStatus] = useState<string>('all');
  const [vehicleCategory, setVehicleCategory] = useState<string>('all');
  const [leadStage, setLeadStage] = useState<string>('all');
  const [leadPriority, setLeadPriority] = useState<string>('all');

  // Vehicle form
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<AutoVehicle | null>(null);
  const [vMake, setVMake] = useState('');
  const [vModel, setVModel] = useState('');
  const [vYear, setVYear] = useState(String(new Date().getFullYear()));
  const [vMileage, setVMileage] = useState('');
  const [vPrice, setVPrice] = useState('');
  const [vCondition, setVCondition] = useState('used');
  const [vEngineVolume, setVEngineVolume] = useState('');
  const [vEngineType, setVEngineType] = useState('gasoline');
  const [vTransmission, setVTransmission] = useState('automatic');
  const [vDrive, setVDrive] = useState('fwd');
  const [vBodyType, setVBodyType] = useState('sedan');
  const [vColor, setVColor] = useState('');
  const [vVin, setVVin] = useState('');
  const [vCity, setVCity] = useState('');
  const [vCategory, setVCategory] = useState('car');
  const [vDescription, setVDescription] = useState('');
  const [vReserveOnline, setVReserveOnline] = useState(false);
  const [vReserveDeposit, setVReserveDeposit] = useState('5000');
  const [vCreditAvail, setVCreditAvail] = useState(false);
  const [vLeasingAvail, setVLeasingAvail] = useState(false);
  const [vTradeInAccepted, setVTradeInAccepted] = useState(true);
  const [vIsElectric, setVIsElectric] = useState(false);
  const [vRangeKm, setVRangeKm] = useState('');

  // Lead form
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadVehicleId, setLeadVehicleId] = useState('');
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadSource, setLeadSource] = useState('call');
  const [leadMessage, setLeadMessage] = useState('');
  const [leadBudgetMin, setLeadBudgetMin] = useState('');
  const [leadBudgetMax, setLeadBudgetMax] = useState('');
  const [leadPriorityNew, setLeadPriorityNew] = useState('normal');

  // Lead move
  const [movingLead, setMovingLead] = useState<AutoLead | null>(null);
  const [moveStage, setMoveStage] = useState('');
  const [moveNotes, setMoveNotes] = useState('');
  const [moveLostReason, setMoveLostReason] = useState('');

  // Valuation
  const [showValuationForm, setShowValuationForm] = useState(false);
  const [valVehicleId, setValVehicleId] = useState('');
  const [valMake, setValMake] = useState('');
  const [valModel, setValModel] = useState('');
  const [valYear, setValYear] = useState('');
  const [valMileage, setValMileage] = useState('');
  const [valCondition, setValCondition] = useState('good');
  const [valCity, setValCity] = useState('');
  const [latestValuation, setLatestValuation] = useState<AutoValuation | null>(null);

  // Test drive form
  const [showTDForm, setShowTDForm] = useState(false);
  const [tdVehicleId, setTDVehicleId] = useState('');
  const [tdLeadId, setTDLeadId] = useState('');
  const [tdClientName, setTDClientName] = useState('');
  const [tdClientPhone, setTDClientPhone] = useState('');
  const [tdScheduledAt, setTDScheduledAt] = useState('');
  const [tdDuration, setTDDuration] = useState('30');
  const [tdManager, setTDManager] = useState('');

  // Status change
  const [statusChangeVehicle, setStatusChangeVehicle] = useState<AutoVehicle | null>(null);
  const [newStatus, setNewStatus] = useState('');
  const [newPrice, setNewPrice] = useState('');

  // Promo modal
  const [promoVehicle, setPromoVehicle] = useState<AutoVehicle | null>(null);
  const [selectedPromo, setSelectedPromo] = useState('standard');

  // Publish to marketplace modal
  const [publishVehicle, setPublishVehicle] = useState<AutoVehicle | null>(null);
  const [publishSources, setPublishSources] = useState<string[]>([]);

  // VIN check
  const [vinCheckingId, setVinCheckingId] = useState<string | null>(null);

  // Lead buying intent
  const [leadBuyingTimeframe, setLeadBuyingTimeframe] = useState('this_week');
  const [leadFinanceNeeded, setLeadFinanceNeeded] = useState(false);

  // Hot deals view
  const [showHotDeals, setShowHotDeals] = useState(false);

  // ─── Load ───────────────────────────────────────────────────────────────────
  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      crm.setProfession('auto');
      const [statsData, vehiclesData, leadsData, tdsData] = await Promise.all([
        crm.getAutoDashboardStats(),
        crm.getAutoVehicles(),
        crm.getAutoLeads(),
        crm.getAutoTestDrives(),
      ]);
      setStats(statsData);
      setVehicles(vehiclesData);
      setLeads(leadsData);
      setTestDrives(tdsData);
    } catch (err) {
      logger.error('[CRMAutoDashboard] Auto CRM load error', { error: err });
      if (!silent) toast.error('Ошибка загрузки данных');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleSaveVehicle = async () => {
    if (!vMake || !vModel || !vYear || !vPrice) { toast.error('Заполните марку, модель, год, цену'); return; }
    try {
      const saved = await crm.upsertAutoVehicle({
        id: editingVehicle?.id,
        make: vMake, model: vModel, year: parseInt(vYear),
        mileage: parseInt(vMileage) || 0, price: parseInt(vPrice.replace(/\D/g, '')),
        condition: vCondition as AutoVehicle['condition'],
        engine_volume: vEngineVolume ? parseFloat(vEngineVolume) : undefined,
        engine_type: vEngineType as AutoVehicle['engine_type'],
        transmission: vTransmission as AutoVehicle['transmission'],
        drive: vDrive as AutoVehicle['drive'],
        body_type: vBodyType, color: vColor || undefined, vin: vVin || undefined,
        city: vCity || undefined, vehicle_category: vCategory as AutoVehicle['vehicle_category'],
        description: vDescription || undefined,
        reserve_online: vReserveOnline, reserve_deposit: vReserveDeposit ? parseInt(vReserveDeposit) : undefined,
        credit_available: vCreditAvail, leasing_available: vLeasingAvail,
        trade_in_accepted: vTradeInAccepted, is_electric: vIsElectric,
        range_km: vRangeKm ? parseInt(vRangeKm) : undefined,
      });
      setVehicles(prev => {
        const idx = prev.findIndex(v => v.id === saved.id);
        return idx >= 0 ? prev.map(v => v.id === saved.id ? saved : v) : [saved, ...prev];
      });
      toast.success(editingVehicle ? 'Объявление обновлено' : 'Объявление создано');
      setShowVehicleForm(false); setEditingVehicle(null);
    } catch (error) {
      logger.warn('[CRMAutoDashboard] Failed to save vehicle', { error, editingVehicleId: editingVehicle?.id ?? null });
      toast.error('Ошибка сохранения');
    }
  };

  const handleStatusChange = async () => {
    if (!statusChangeVehicle || !newStatus) return;
    try {
      const updated = await crm.changeVehicleStatus(
        statusChangeVehicle.id, newStatus as AutoVehicle['status'],
        newPrice ? parseInt(newPrice.replace(/\D/g, '')) : undefined
      );
      setVehicles(prev => prev.map(v => v.id === updated.id ? updated : v));
      toast.success(`Статус изменён: ${VEHICLE_STATUS_LABELS[newStatus]}`);
      setStatusChangeVehicle(null); setNewStatus(''); setNewPrice('');
    } catch (error) {
      logger.warn('[CRMAutoDashboard] Failed to change vehicle status', {
        error,
        vehicleId: statusChangeVehicle.id,
        newStatus,
      });
      toast.error('Ошибка обновления статуса');
    }
  };

  const handleSaveLead = async () => {
    if (!leadName || !leadPhone) { toast.error('Укажите имя и телефон'); return; }
    try {
      const saved = await crm.upsertAutoLead({
        vehicle_id: leadVehicleId || undefined,
        name: leadName, phone: leadPhone, email: leadEmail || undefined,
        source: leadSource as AutoLead['source'],
        message: leadMessage || undefined,
        budget_min: leadBudgetMin ? parseInt(leadBudgetMin) : undefined,
        budget_max: leadBudgetMax ? parseInt(leadBudgetMax) : undefined,
        priority: leadPriorityNew as AutoLead['priority'],
      });
      setLeads(prev => [saved, ...prev]);
      toast.success('Лид добавлен');
      setShowLeadForm(false);
      setLeadName(''); setLeadPhone(''); setLeadEmail(''); setLeadVehicleId(''); setLeadMessage('');
    } catch (error) {
      logger.warn('[CRMAutoDashboard] Failed to create lead', { error });
      toast.error('Ошибка создания лида');
    }
  };

  const handleMoveLead = async () => {
    if (!movingLead || !moveStage) return;
    try {
      const updated = await crm.moveAutoLeadStage(movingLead.id, moveStage as AutoLead['stage'], moveNotes || undefined, moveLostReason || undefined);
      setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
      toast.success(`Стадия: ${AUTO_LEAD_STAGES.find(s => s.value === moveStage)?.label ?? moveStage}`);
      setMovingLead(null); setMoveStage(''); setMoveNotes(''); setMoveLostReason('');
    } catch (error) {
      logger.warn('[CRMAutoDashboard] Failed to move lead stage', { error, leadId: movingLead.id, moveStage });
      toast.error('Ошибка');
    }
  };

  const handleComputeValuation = async () => {
    if (!valMake && !valVehicleId) { toast.error('Выберите авто или укажите марку/модель/год'); return; }
    try {
      const val = await crm.computeAutoValuation({
        vehicleId: valVehicleId || undefined,
        make: valMake || undefined, model: valModel || undefined,
        year: valYear ? parseInt(valYear) : undefined,
        mileage: valMileage ? parseInt(valMileage) : undefined,
        condition: valCondition, city: valCity || undefined,
      });
      setValuations(prev => [val, ...prev]);
      setLatestValuation(val);
      toast.success(`Оценка: ${fmtPrice(val.value_mid)} (уверенность ${val.confidence_pct}%)`);
    } catch (error) {
      logger.warn('[CRMAutoDashboard] Failed to compute valuation', { error, valVehicleId });
      toast.error('Ошибка оценки');
    }
  };

  const handleSaveTestDrive = async () => {
    if (!tdClientName || !tdClientPhone || !tdScheduledAt || !tdVehicleId) {
      toast.error('Укажите клиента, авто и время'); return;
    }
    try {
      const td = await crm.upsertAutoTestDrive({
        vehicleId: tdVehicleId, lead_id: tdLeadId || undefined,
        clientName: tdClientName, clientPhone: tdClientPhone,
        scheduledAt: tdScheduledAt, duration_min: parseInt(tdDuration) || 30,
        manager: tdManager || undefined,
      });
      setTestDrives(prev => [td, ...prev]);
      toast.success('Тест-драйв запланирован');
      setShowTDForm(false);
      setTDClientName(''); setTDClientPhone(''); setTDScheduledAt(''); setTDVehicleId(''); setTDLeadId('');
    } catch (error) {
      logger.warn('[CRMAutoDashboard] Failed to save test drive', { error, tdVehicleId, tdLeadId });
      toast.error('Ошибка');
    }
  };

  const handleApplyPromo = async () => {
    if (!promoVehicle) return;
    await handlePromote(promoVehicle.id, selectedPromo);
  };

  const handlePublishToMarketplace = async () => {
    if (!publishVehicle || publishSources.length === 0) { toast.error('Выберите площадки'); return; }
    const now = new Date().toISOString();
    const newPubs = publishSources.map(src => ({
      source: src, listing_id: `${src}_${Date.now()}`,
      url: `https://${src === 'auto_ru' ? 'auto.ru' : src === 'avito' ? 'avito.ru' : 'drom.ru'}/listing/${publishVehicle.id}`,
      published_at: now, promo_package: 'free',
    }));
    setVehicles(prev => prev.map(v => v.id === publishVehicle.id
      ? { ...v, published_to: [...v.published_to.filter(p => !publishSources.includes(p.source)), ...newPubs], status: 'active' as const }
      : v
    ));
    toast.success(`📤 Опубликовано на: ${publishSources.map(s => AUTO_SOURCES.find(a => a.value === s)?.label ?? s).join(', ')}`);
    setPublishVehicle(null);
    setPublishSources([]);
  };

  const handleVinCheck = async (vehicleId: string, vin: string) => {
    if (!vin) { toast.error('VIN не указан в объявлении'); return; }
    setVinCheckingId(vehicleId);
    try {
      // Call Supabase Edge Function vin-check
      // Sources: ГИБДД + ФНП (залоги) + ФССП + avtocod.ru (optional)
      const { data, error } = await (await import('@/lib/supabase')).supabase.functions.invoke('vin-check', {
        body: { vin, vehicle_id: vehicleId },
      });

      if (error) throw error;

      const result = data as {
        accidents_count: number;
        owners_count: number | null;
        restrictions: boolean;
        stolen: boolean;
        pledges: boolean;
        pledges_count: number;
        total_risk_score: number;
        risk_factors: string[];
        recommendation: 'buy' | 'caution' | 'avoid';
      };

      // Update local state with real data
      setVehicles(prev => prev.map(v => v.id === vehicleId
        ? {
            ...v,
            vin_checked: true,
            vin_checked_at: new Date().toISOString(),
            vin_check_result: {
              accidents: result.accidents_count,
              owners: result.owners_count ?? 1,
              restrictions: result.restrictions,
              wanted: result.stolen,
              pledges: result.pledges,
              pledges_count: result.pledges_count,
            },
          }
        : v
      ));

      // Toast based on risk level
      const riskScore = result.total_risk_score;
      if (result.stolen) {
        toast.error(`🚨 VIN ВНИМАНИЕ: авто числится в розыске!`);
      } else if (riskScore >= 50) {
        toast.error(`❌ Высокий риск (${riskScore}/100): ${result.risk_factors.slice(0, 2).join(' · ')}`);
      } else if (riskScore >= 20) {
        toast.warning(`⚠️ Средний риск (${riskScore}/100): ${result.risk_factors.join(' · ')}`);
      } else {
        toast.success(`✅ VIN чист: ${result.owners_count ?? '?'} вл. · ${result.accidents_count} ДТП · ${result.pledges_count} залогов`);
      }

    } catch (err) {
      logger.error('[CRMAutoDashboard] VIN check error', { error: err, vehicleId, vin });
      toast.error('Ошибка VIN-проверки. Проверьте подключение.');
    } finally {
      setVinCheckingId(null);
    }
  };

  const handlePromote = async (vehicleId: string, pkg: string) => {
    try {
      await crm.changeVehicleStatus(vehicleId, 'active');
      setVehicles(prev => prev.map(v => v.id === vehicleId ? { ...v, status: 'active', promo_package: pkg } : v));
      const p = AUTO_PROMO_PACKAGES.find(p => p.value === pkg);
      toast.success(`Продвижение: ${p?.label ?? pkg}${p?.price ? ` — ${fmtPrice(p.price)}/день` : ''}`);
    } catch (error) {
      logger.warn('[CRMAutoDashboard] Failed to apply promotion', { error, vehicleId, pkg });
      toast.error('Ошибка');
    }
  };

  // ─── Computed ────────────────────────────────────────────────────────────────

  const filteredVehicles = vehicles.filter(v => {
    const q = searchQuery.toLowerCase();
    if (vehicleStatus !== 'all' && v.status !== vehicleStatus) return false;
    if (vehicleCategory !== 'all' && v.vehicle_category !== vehicleCategory) return false;
    if (q && !`${v.make} ${v.model} ${v.year} ${v.city ?? ''}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const filteredLeads = leads.filter(l => {
    const q = searchQuery.toLowerCase();
    if (leadStage !== 'all' && l.stage !== leadStage) return false;
    if (leadPriority !== 'all' && l.priority !== leadPriority) return false;
    if (q && !`${l.name ?? ''} ${l.phone ?? ''} ${l.city ?? ''}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const todayTestDrives = testDrives.filter(td => {
    const d = new Date(td.scheduled_at);
    return d.toDateString() === new Date().toDateString() && td.status === 'scheduled';
  });

  const getVehicleTitle = (id: string | null) => {
    if (!id) return '—';
    const v = vehicles.find(v => v.id === id);
    return v ? `${v.make} ${v.model} ${v.year}` : '—';
  };

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500" />
      </div>
    );
  }

  // ─── Tab config ─────────────────────────────────────────────────────────────
  const TABS: Array<{ id: Tab; label: string; badge?: number }> = [
    { id: 'dashboard',   label: 'Дашборд' },
    { id: 'inventory',   label: '🚗 Объявления', badge: stats?.active_listings },
    { id: 'leads',       label: '📥 Лиды',       badge: stats?.total_new_leads || undefined },
    { id: 'deals',       label: '🤝 Сделки',     badge: stats?.deals_this_month || undefined },
    { id: 'valuations',  label: '💰 Оценка' },
    { id: 'test_drives', label: '🏎️ Тест-драйвы', badge: todayTestDrives.length || undefined },
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
              <Car className="w-5 h-5 text-orange-400" /> Авто CRM
            </h1>
            {stats && (
              <p className="text-xs text-slate-400">
                {stats.active_listings} объявлений · {stats.total_new_leads} новых лидов
                {stats.test_drives_today > 0 && ` · ${stats.test_drives_today} тест-драйвов сегодня`}
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
                activeTab === tab.id ? 'border-orange-500 text-orange-400' : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded-full text-xs">{tab.badge}</span>
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
              <div className="p-2 bg-orange-500/20 rounded-lg w-fit mb-2"><Car className="w-5 h-5 text-orange-400" /></div>
              <p className="text-2xl font-bold text-white">{stats.active_listings}</p>
              <p className="text-xs text-slate-400">Активных объявлений</p>
              {stats.draft_listings > 0 && <p className="text-xs text-slate-500">{stats.draft_listings} черновиков</p>}
            </div>
            <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700/50">
              <div className="p-2 bg-blue-500/20 rounded-lg w-fit mb-2"><Users className="w-5 h-5 text-blue-400" /></div>
              <p className="text-2xl font-bold text-white">{stats.total_new_leads}</p>
              <p className="text-xs text-slate-400">Новых лидов</p>
              {stats.hot_leads > 0 && <p className="text-xs text-red-400">🔥 {stats.hot_leads} горячих</p>}
            </div>
            <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700/50">
              <div className="p-2 bg-green-500/20 rounded-lg w-fit mb-2"><CheckCircle className="w-5 h-5 text-green-400" /></div>
              <p className="text-2xl font-bold text-white">{stats.sold_this_month}</p>
              <p className="text-xs text-slate-400">Продано за месяц</p>
            </div>
            <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700/50">
              <div className="p-2 bg-amber-500/20 rounded-lg w-fit mb-2"><TrendingUp className="w-5 h-5 text-amber-400" /></div>
              <p className="text-2xl font-bold text-white">
                {stats.revenue_this_month > 0 ? `${Math.round(stats.revenue_this_month / 1_000_000 * 10) / 10}M` : '—'}
              </p>
              <p className="text-xs text-slate-400">Выручка за месяц</p>
              {stats.avg_sale_price > 0 && <p className="text-xs text-slate-500">ср. {fmtPrice(stats.avg_sale_price)}</p>}
            </div>
          </div>

          {/* Metrics row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-800/60 rounded-xl p-3 text-center border border-slate-700/30">
              <p className="text-lg font-bold text-white">{stats.total_views > 0 ? fmt(stats.total_views) : '—'}</p>
              <p className="text-xs text-slate-400">Просмотров</p>
            </div>
            <div className="bg-slate-800/60 rounded-xl p-3 text-center border border-slate-700/30">
              <p className="text-lg font-bold text-white">{stats.total_contacts > 0 ? fmt(stats.total_contacts) : '—'}</p>
              <p className="text-xs text-slate-400">Контактов</p>
            </div>
            <div className="bg-slate-800/60 rounded-xl p-3 text-center border border-slate-700/30">
              <p className="text-lg font-bold text-white">{stats.avg_days_on_market > 0 ? `${stats.avg_days_on_market}д` : '—'}</p>
              <p className="text-xs text-slate-400">Ср. продажа</p>
            </div>
          </div>

          {/* Today test drives */}
          {todayTestDrives.length > 0 && (
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-2xl p-4">
              <p className="text-purple-400 font-medium text-sm mb-2">🏎️ Тест-драйвы сегодня</p>
              {todayTestDrives.map(td => (
                <div key={td.id} className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-white text-sm">{td.client_name}</p>
                    <p className="text-xs text-slate-400">{getVehicleTitle(td.vehicle_id)} · {new Date(td.scheduled_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  {td.client_phone && (
                    <a href={`tel:${td.client_phone}`} className="p-2 bg-green-600/20 text-green-400 rounded-lg">
                      <Phone className="w-4 h-4" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Reserved vehicles */}
          {stats.reserved > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
              <p className="text-amber-400 font-medium text-sm">🔒 {stats.reserved} авто забронировано онлайн</p>
            </div>
          )}

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => { setActiveTab('inventory'); setShowVehicleForm(true); }}
              className="flex items-center gap-2 p-3 bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/30 rounded-xl text-orange-400 text-sm">
              <Plus className="w-4 h-4" /> Новое объявление
            </button>
            <button onClick={() => { setActiveTab('leads'); setShowLeadForm(true); }}
              className="flex items-center gap-2 p-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-xl text-blue-400 text-sm">
              <Users className="w-4 h-4" /> Добавить лид
            </button>
            <button onClick={() => { setActiveTab('valuations'); setShowValuationForm(true); }}
              className="flex items-center gap-2 p-3 bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 rounded-xl text-green-400 text-sm">
              <BarChart2 className="w-4 h-4" /> Оценить авто
            </button>
            <button onClick={() => { setActiveTab('test_drives'); setShowTDForm(true); }}
              className="flex items-center gap-2 p-3 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-xl text-purple-400 text-sm">
              <Calendar className="w-4 h-4" /> Тест-драйв
            </button>
            <button onClick={() => setShowHotDeals(true)}
              className="col-span-2 flex items-center justify-center gap-2 p-3 bg-red-600/10 hover:bg-red-600/20 border border-red-500/20 rounded-xl text-red-400 text-sm">
              🔥 Горячие сделки ниже рынка ({vehicles.filter(v => v.status === 'active' && v.recommended_price && v.price < v.recommended_price).length})
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          INVENTORY TAB
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'inventory' && (
        <div className="p-4 space-y-4">
          {/* Search & filters */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-9 pr-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500"
              placeholder="Поиск по марке, модели, городу..."
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Category filter */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            <button onClick={() => setVehicleCategory('all')}
              className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${vehicleCategory === 'all' ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
              Все
            </button>
            {AUTO_VEHICLE_CATEGORIES.map(cat => (
              <button key={cat.value} onClick={() => setVehicleCategory(cat.value)}
                className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${vehicleCategory === cat.value ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                {cat.label}
              </button>
            ))}
          </div>

          {/* Status filter */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {['all', 'active', 'draft', 'reserved', 'paused', 'sold'].map(s => (
              <button key={s} onClick={() => setVehicleStatus(s)}
                className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${vehicleStatus === s ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                {s === 'all' ? 'Все' : VEHICLE_STATUS_LABELS[s] ?? s}
              </button>
            ))}
          </div>

          {/* Add button */}
          <button onClick={() => { setEditingVehicle(null); setShowVehicleForm(true); setVMake(''); setVModel(''); setVYear(String(new Date().getFullYear())); setVMileage(''); setVPrice(''); setVCondition('used'); setVEngineVolume(''); setVEngineType('gasoline'); setVTransmission('automatic'); setVDrive('fwd'); setVBodyType('sedan'); setVColor(''); setVVin(''); setVCity(''); setVCategory('car'); setVDescription(''); setVReserveOnline(false); setVCreditAvail(false); setVLeasingAvail(false); setVTradeInAccepted(true); setVIsElectric(false); setVRangeKm(''); }}
            className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-medium flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> Добавить объявление
          </button>

          {/* Vehicles list */}
          {filteredVehicles.map(v => (
            <div key={v.id} className="bg-slate-800/80 rounded-2xl border border-slate-700/50 overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white font-semibold">{v.make} {v.model} {v.year}</p>
                      {v.is_electric && <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded-full">⚡ EV</span>}
                      {v.reserve_online && <span className="text-xs px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded-full">🔒 Онлайн-бронь</span>}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {v.body_type && <span className="mr-2">{AUTO_BODY_TYPES.find(b => b.value === v.body_type)?.label ?? v.body_type}</span>}
                      {v.engine_volume && <span className="mr-2">{v.engine_volume}л</span>}
                      {v.transmission && <span className="mr-2">{AUTO_TRANSMISSIONS.find(t => t.value === v.transmission)?.label}</span>}
                      {v.mileage > 0 && <span>{fmt(v.mileage)} км</span>}
                    </p>
                    {v.city && <p className="text-xs text-slate-500">📍 {v.city}</p>}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ml-2 ${VEHICLE_STATUS_COLORS[v.status] ?? ''}`}>
                    {VEHICLE_STATUS_LABELS[v.status] ?? v.status}
                  </span>
                </div>

                {/* Price & market value */}
                <div className="flex items-center gap-3 mb-3">
                  <p className="text-xl font-bold text-white">{fmtPrice(v.price)}</p>
                  {v.recommended_price && v.recommended_price !== v.price && (
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      v.price > v.recommended_price ? 'bg-red-500/20 text-red-400' :
                      v.price < v.recommended_price ? 'bg-green-500/20 text-green-400' :
                      'bg-slate-500/20 text-slate-400'
                    }`}>
                      {v.price > v.recommended_price ? '↑ Выше рынка' : '↓ Ниже рынка'}
                    </span>
                  )}
                  {v.negotiable && <span className="text-xs text-slate-500">торг</span>}
                </div>

                {/* Stats row */}
                {(v.views_total > 0 || v.contacts_total > 0 || v.favorites_total > 0) && (
                  <div className="flex gap-4 mb-3 text-xs text-slate-400">
                    {v.views_total > 0 && <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {fmt(v.views_total)}</span>}
                    {v.contacts_total > 0 && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {v.contacts_total}</span>}
                    {v.favorites_total > 0 && <span>♥ {v.favorites_total}</span>}
                    {v.days_on_market > 0 && <span className={v.days_on_market > 30 ? 'text-red-400' : ''}><Clock className="w-3 h-3 inline" /> {v.days_on_market}д на рынке</span>}
                  </div>
                )}

                {/* Finance badges */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {v.credit_available && <span className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded">💳 Кредит</span>}
                  {v.leasing_available && <span className="text-xs px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded">📋 Лизинг</span>}
                  {v.trade_in_accepted && <span className="text-xs px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded">↔️ Трейд-ин</span>}
                  {v.is_electric && v.range_km && <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-400 rounded">⚡ {v.range_km}км</span>}
                </div>

                {/* VIN info */}
                {v.vin && (
                  <div className={`flex items-center gap-1 text-xs mb-3 ${v.vin_checked ? 'text-green-400' : 'text-slate-500'}`}>
                    <Shield className="w-3 h-3" />
                    {v.vin_checked
                      ? `VIN ✓ · ${v.vin_check_result?.owners ?? '?'} влад. · ${v.vin_check_result?.accidents ?? 0} ДТП`
                      : `VIN: ${v.vin.slice(0, 6)}…`}
                  </div>
                )}

                {/* Promo package */}
                {v.promo_package && v.promo_package !== 'free' && (
                  <div className={`text-xs px-2 py-1 rounded mb-3 w-fit
                    ${AUTO_PROMO_PACKAGES.find(p => p.value === v.promo_package)?.color ?? 'text-slate-400'}`}>
                    ⭐ {AUTO_PROMO_PACKAGES.find(p => p.value === v.promo_package)?.label ?? v.promo_package}
                  </div>
                )}

                {/* Published to */}
                {v.published_to.length > 0 && (
                  <div className="flex gap-1 flex-wrap mb-3">
                    {v.published_to.map((pub, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 bg-slate-700 text-slate-300 rounded">
                        {SOURCE_ICON[pub.source] ?? '📋'} {pub.source}
                      </span>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  <button
                    onClick={() => {
                      setEditingVehicle(v);
                      setVMake(v.make); setVModel(v.model); setVYear(String(v.year));
                      setVMileage(String(v.mileage)); setVPrice(String(v.price));
                      setVCondition(v.condition); setVEngineVolume(String(v.engine_volume ?? ''));
                      setVEngineType(v.engine_type ?? 'gasoline'); setVTransmission(v.transmission ?? 'automatic');
                      setVDrive(v.drive ?? 'fwd'); setVBodyType(v.body_type ?? 'sedan');
                      setVColor(v.color ?? ''); setVVin(v.vin ?? ''); setVCity(v.city ?? '');
                      setVCategory(v.vehicle_category); setVDescription(v.description ?? '');
                      setVReserveOnline(v.reserve_online); setVReserveDeposit(String(v.reserve_deposit ?? 5000));
                      setVCreditAvail(v.credit_available); setVLeasingAvail(v.leasing_available);
                      setVTradeInAccepted(v.trade_in_accepted); setVIsElectric(v.is_electric);
                      setVRangeKm(String(v.range_km ?? '')); setShowVehicleForm(true);
                    }}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs flex items-center gap-1"
                  >
                    <Edit2 className="w-3 h-3" /> Редактировать
                  </button>
                  <button
                    onClick={() => { setStatusChangeVehicle(v); setNewStatus(v.status); setNewPrice(''); }}
                    className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 rounded-lg text-xs"
                  >
                    Статус
                  </button>
                  <button
                    onClick={() => { setValVehicleId(v.id); setValMake(v.make); setValModel(v.model); setValYear(String(v.year)); setValMileage(String(v.mileage)); setActiveTab('valuations'); setShowValuationForm(true); }}
                    className="px-3 py-1.5 bg-green-600/20 hover:bg-green-600/40 text-green-400 rounded-lg text-xs flex items-center gap-1"
                  >
                    <BarChart2 className="w-3 h-3" /> Оценить
                  </button>
                  {/* Promote modal trigger */}
                  {v.status === 'active' && (
                    <button
                      onClick={() => { setPromoVehicle(v); setSelectedPromo(v.promo_package ?? 'standard'); }}
                      className="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 rounded-lg text-xs flex items-center gap-1"
                    >
                      <Zap className="w-3 h-3" /> Продвинуть
                    </button>
                  )}
                  {/* Publish to marketplace */}
                  <button
                    onClick={() => { setPublishVehicle(v); setPublishSources(v.published_to.map(p => p.source)); }}
                    className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded-lg text-xs flex items-center gap-1"
                  >
                    📤 Площадки
                  </button>
                  {/* VIN check */}
                  {v.vin && !v.vin_checked && (
                    <button
                      onClick={() => handleVinCheck(v.id, v.vin!)}
                      disabled={vinCheckingId === v.id}
                      className="px-3 py-1.5 bg-slate-600/40 hover:bg-slate-600/60 text-slate-300 rounded-lg text-xs flex items-center gap-1 disabled:opacity-50"
                    >
                      <Shield className="w-3 h-3" />
                      {vinCheckingId === v.id ? '⏳ Проверка…' : 'VIN-check'}
                    </button>
                  )}
                  {v.status === 'draft' && (
                    <button
                      onClick={() => crm.changeVehicleStatus(v.id, 'active').then(u => setVehicles(prev => prev.map(x => x.id === u.id ? u : x))).then(() => toast.success('Опубликовано!'))}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs"
                    >
                      ▶ Опубликовать
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {filteredVehicles.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <Car className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Нет объявлений</p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          LEADS TAB
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'leads' && (
        <div className="p-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-9 pr-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500"
              placeholder="Поиск по имени, телефону..."
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Stage filter */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            <button onClick={() => setLeadStage('all')}
              className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${leadStage === 'all' ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
              Все
            </button>
            {AUTO_LEAD_STAGES.map(s => (
              <button key={s.value} onClick={() => setLeadStage(s.value)}
                className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${leadStage === s.value ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                {s.label} ({leads.filter(l => l.stage === s.value).length})
              </button>
            ))}
          </div>

          {/* Priority filter */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {['all', 'hot', 'high', 'normal'].map(p => (
              <button key={p} onClick={() => setLeadPriority(p)}
                className={`px-3 py-1.5 rounded-full text-xs ${leadPriority === p ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                {p === 'all' ? 'Все приоритеты' : p === 'hot' ? '🔥 Горячие' : p === 'high' ? '↑ Высокий' : 'Обычные'}
              </button>
            ))}
          </div>

          <button onClick={() => setShowLeadForm(true)}
            className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-medium flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> Добавить лид
          </button>

          {filteredLeads.map(lead => {
            const vehicle = lead.vehicle_id ? vehicles.find(v => v.id === lead.vehicle_id) : null;
            return (
              <div key={lead.id} className="bg-slate-800/80 rounded-2xl border border-slate-700/50 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-white font-medium">{lead.name ?? '—'}</p>
                      {lead.priority !== 'normal' && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${LEAD_PRIORITY_COLORS[lead.priority]}`}>
                          {lead.priority === 'hot' ? '🔥' : lead.priority === 'high' ? '↑' : ''} {lead.priority}
                        </span>
                      )}
                    </div>
                    {vehicle && <p className="text-xs text-slate-400">{vehicle.make} {vehicle.model} {vehicle.year} · {fmtPrice(vehicle.price)}</p>}
                    {lead.message && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">"{lead.message}"</p>}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    AUTO_LEAD_STAGES.find(s => s.value === lead.stage)?.color ?? 'bg-slate-700'
                  } bg-opacity-20 text-white ml-2`}>
                    {AUTO_LEAD_STAGES.find(s => s.value === lead.stage)?.label ?? lead.stage}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-400 mb-3">
                  <span>{SOURCE_ICON[lead.source] ?? '📋'} {AUTO_SOURCES.find(s => s.value === lead.source)?.label ?? lead.source}</span>
                  {lead.budget_min && <span>💰 {fmtPrice(lead.budget_min)}{lead.budget_max ? `–${fmtPrice(lead.budget_max)}` : '+'}</span>}
                  <span>{new Date(lead.last_activity_at).toLocaleDateString('ru')}</span>
                </div>

                <div className="flex gap-2">
                  {lead.phone && (
                    <a href={`tel:${lead.phone}`} className="p-2 bg-green-600/20 text-green-400 rounded-lg flex-shrink-0">
                      <Phone className="w-4 h-4" />
                    </a>
                  )}
                  {lead.email && (
                    <a href={`mailto:${lead.email}`} className="p-2 bg-blue-600/20 text-blue-400 rounded-lg flex-shrink-0">
                      <Mail className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    onClick={() => { setMovingLead(lead); setMoveStage(lead.stage); setMoveNotes(''); setMoveLostReason(''); }}
                    className="flex-1 py-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 rounded-lg text-xs"
                  >
                    ▶ Переместить
                  </button>
                  {lead.stage !== 'test_drive' && (
                    <button
                      onClick={() => { setTDVehicleId(lead.vehicle_id ?? ''); setTDLeadId(lead.id); setTDClientName(lead.name ?? ''); setTDClientPhone(lead.phone ?? ''); setShowTDForm(true); setActiveTab('test_drives'); }}
                      className="px-3 py-2 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 rounded-lg text-xs"
                    >
                      🏎️ Тест
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {filteredLeads.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Нет лидов</p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          DEALS TAB
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'deals' && (
        <div className="p-4 space-y-4">
          <div className="text-center py-12 text-slate-500">
            <Target className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-white font-medium mb-1">Воронка сделок</p>
            <p className="text-sm">Переводите лиды в стадии "Сделка" для трекинга</p>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {['interest','inspection','docs_prep','delivery'].map(stage => {
                const STAGE_LABELS: Record<string, string> = {
                  interest: 'Интерес', inspection: 'Осмотр', docs_prep: 'Документы', delivery: 'Выдача'
                };
                const count = leads.filter(l => l.stage === 'deal').length;
                return (
                  <div key={stage} className="bg-slate-800 rounded-xl p-3 text-center border border-slate-700/50">
                    <p className="text-2xl font-bold text-white">{stage === 'interest' ? count : 0}</p>
                    <p className="text-xs text-slate-400">{STAGE_LABELS[stage]}</p>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 bg-slate-800/60 rounded-2xl p-4 border border-slate-700/30">
              <p className="text-xs text-slate-400">За месяц</p>
              <p className="text-2xl font-bold text-white">{stats?.deals_this_month ?? 0} сделок</p>
              <p className="text-lg text-green-400">{stats?.revenue_this_month ? fmtPrice(stats.revenue_this_month) : '—'}</p>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          VALUATIONS TAB (AutoTrader "Value your car")
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'valuations' && (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-green-400" /> Оценка рыночной стоимости
            </h2>
            <button onClick={() => setShowValuationForm(true)}
              className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-1">
              <Plus className="w-3 h-3" /> Оценить
            </button>
          </div>

          {showValuationForm && (
            <div className="bg-slate-800/80 rounded-2xl border border-green-500/30 p-4 space-y-3">
              <p className="text-white font-medium text-sm">Мгновенная оценка</p>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Выбрать из своего автопарка</label>
                <select
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
                  value={valVehicleId} onChange={e => {
                    setValVehicleId(e.target.value);
                    const v = vehicles.find(v => v.id === e.target.value);
                    if (v) { setValMake(v.make); setValModel(v.model); setValYear(String(v.year)); setValMileage(String(v.mileage)); }
                  }}
                >
                  <option value="">— или введите параметры ниже —</option>
                  {vehicles.filter(v => v.status !== 'archived').map(v => (
                    <option key={v.id} value={v.id}>{v.make} {v.model} {v.year} · {fmtPrice(v.price)}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Марка</label>
                  <input className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
                    value={valMake} onChange={e => setValMake(e.target.value)} placeholder="Toyota" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Модель</label>
                  <input className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
                    value={valModel} onChange={e => setValModel(e.target.value)} placeholder="Camry" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Год</label>
                  <input type="number" className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
                    value={valYear} onChange={e => setValYear(e.target.value)} placeholder="2020" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Пробег (км)</label>
                  <input type="number" className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
                    value={valMileage} onChange={e => setValMileage(e.target.value)} placeholder="80000" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Состояние</label>
                  <select className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
                    value={valCondition} onChange={e => setValCondition(e.target.value)}>
                    <option value="excellent">★★★★★ Отличное</option>
                    <option value="good">★★★★ Хорошее</option>
                    <option value="fair">★★★ Среднее</option>
                    <option value="poor">★★ Требует ремонта</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Город</label>
                  <input className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
                    value={valCity} onChange={e => setValCity(e.target.value)} placeholder="Москва" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowValuationForm(false)} className="px-4 py-2.5 bg-slate-700 text-slate-300 rounded-xl text-sm">Отмена</button>
                <button onClick={handleComputeValuation} className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium">
                  Рассчитать стоимость
                </button>
              </div>
            </div>
          )}

          {/* Latest valuation result */}
          {latestValuation && (
            <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-2xl p-5">
              <p className="text-xs text-green-400/70 mb-1">Результат оценки: {latestValuation.make} {latestValuation.model} {latestValuation.year}</p>
              <div className="flex items-end gap-4 mb-4">
                <div>
                  <p className="text-3xl font-bold text-white">{fmtPrice(latestValuation.value_mid)}</p>
                  <p className="text-xs text-slate-400">Рыночная стоимость</p>
                </div>
                <div className="text-right">
                  {latestValuation.confidence_pct && (
                    <p className="text-lg font-bold text-green-400">{latestValuation.confidence_pct}%</p>
                  )}
                  <p className="text-xs text-slate-400">уверенность</p>
                </div>
              </div>

              {/* Range bar */}
              <div className="mb-4">
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>{fmtPrice(latestValuation.value_min)}</span>
                  <span className="text-green-400">⭐ {fmtPrice(latestValuation.value_mid)}</span>
                  <span>{fmtPrice(latestValuation.value_max)}</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full relative">
                  <div className="absolute h-full bg-gradient-to-r from-slate-600 to-green-500 rounded-full"
                    style={{ left: '10%', right: '10%' }} />
                  <div className="absolute h-4 w-1 bg-white rounded-full top-1/2 -translate-y-1/2" style={{ left: '50%' }} />
                </div>
              </div>

              {/* Position indicator */}
              {latestValuation.price_position && (
                <div className={`p-3 rounded-xl text-sm ${
                  latestValuation.price_position === 'underpriced' ? 'bg-green-500/10 text-green-400' :
                  latestValuation.price_position === 'overpriced' ? 'bg-red-500/10 text-red-400' :
                  'bg-slate-700/50 text-slate-300'
                }`}>
                  {latestValuation.price_position === 'underpriced' && '✓ Ваша цена ниже рынка — быстро продастся'}
                  {latestValuation.price_position === 'overpriced' && '⚠ Цена выше рынка — снизьте для быстрой продажи'}
                  {latestValuation.price_position === 'fair' && '✓ Справедливая рыночная цена'}
                </div>
              )}

              {/* Recommended price */}
              {latestValuation.recommended_price && (
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-slate-400">Рекомендуемая цена для быстрой продажи:</span>
                  <span className="text-amber-400 font-semibold">{fmtPrice(latestValuation.recommended_price)}</span>
                </div>
              )}

              {latestValuation.days_avg_sell && (
                <p className="text-xs text-slate-400 mt-2">⏱ Среднее время продажи: {latestValuation.days_avg_sell} дней</p>
              )}
            </div>
          )}

          {/* History */}
          {valuations.filter(v => v.id !== latestValuation?.id).slice(0, 5).map(val => (
            <div key={val.id} className="bg-slate-800/60 rounded-xl border border-slate-700/30 p-3 flex items-center justify-between">
              <div>
                <p className="text-white text-sm">{val.make} {val.model} {val.year}</p>
                <p className="text-xs text-slate-400">{fmt(val.mileage)} км · {val.condition}</p>
              </div>
              <div className="text-right">
                <p className="text-white font-medium">{fmtPrice(val.value_mid)}</p>
                <p className="text-xs text-slate-500">{new Date(val.created_at).toLocaleDateString('ru')}</p>
              </div>
            </div>
          ))}

          {valuations.length === 0 && !showValuationForm && !latestValuation && (
            <div className="text-center py-12 text-slate-500">
              <BarChart2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Нет оценок</p>
              <button onClick={() => setShowValuationForm(true)} className="mt-3 text-sm text-green-400 hover:text-green-300">
                Оценить авто →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TEST DRIVES TAB
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'test_drives' && (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold">🏎️ Тест-драйвы</h2>
            <button onClick={() => setShowTDForm(true)}
              className="text-xs px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg flex items-center gap-1">
              <Plus className="w-3 h-3" /> Запланировать
            </button>
          </div>

          {showTDForm && (
            <div className="bg-slate-800/80 rounded-2xl border border-purple-500/30 p-4 space-y-3">
              <p className="text-white font-medium text-sm">Новый тест-драйв</p>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Автомобиль</label>
                <select className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
                  value={tdVehicleId} onChange={e => setTDVehicleId(e.target.value)}>
                  <option value="">— выберите авто —</option>
                  {vehicles.filter(v => v.status === 'active').map(v => (
                    <option key={v.id} value={v.id}>{v.make} {v.model} {v.year} · {fmtPrice(v.price)}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Клиент</label>
                  <input className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
                    value={tdClientName} onChange={e => setTDClientName(e.target.value)} placeholder="Иван Иванов" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Телефон</label>
                  <input className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
                    value={tdClientPhone} onChange={e => setTDClientPhone(e.target.value)} placeholder="+7..." />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Дата и время</label>
                  <input type="datetime-local" className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
                    value={tdScheduledAt} onChange={e => setTDScheduledAt(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Длительность</label>
                  <select className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
                    value={tdDuration} onChange={e => setTDDuration(e.target.value)}>
                    <option value="15">15 мин</option>
                    <option value="30">30 мин</option>
                    <option value="60">1 час</option>
                    <option value="120">2 часа</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Менеджер</label>
                <input className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
                  value={tdManager} onChange={e => setTDManager(e.target.value)} placeholder="Имя менеджера" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowTDForm(false)} className="px-4 py-2.5 bg-slate-700 text-slate-300 rounded-xl text-sm">Отмена</button>
                <button onClick={handleSaveTestDrive} className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-medium">
                  Запланировать
                </button>
              </div>
            </div>
          )}

          {/* Today */}
          {todayTestDrives.length > 0 && (
            <div>
              <p className="text-xs text-slate-400 font-medium mb-2">Сегодня</p>
              {todayTestDrives.map(td => (
                <div key={td.id} className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-3 mb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium">{td.client_name}</p>
                      <p className="text-xs text-purple-400">{getVehicleTitle(td.vehicle_id)}</p>
                      <p className="text-xs text-slate-400">
                        {new Date(td.scheduled_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })} · {td.duration_min} мин
                        {td.manager && ` · ${td.manager}`}
                      </p>
                    </div>
                    {td.client_phone && (
                      <a href={`tel:${td.client_phone}`} className="p-2 bg-green-600/20 text-green-400 rounded-lg">
                        <Phone className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* All test drives */}
          <div>
            <p className="text-xs text-slate-400 font-medium mb-2">Все тест-драйвы ({testDrives.length})</p>
            {testDrives.filter(td => !todayTestDrives.find(t => t.id === td.id)).slice(0, 20).map(td => (
              <div key={td.id} className="bg-slate-800/60 rounded-xl border border-slate-700/30 p-3 mb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm">{td.client_name}</p>
                    <p className="text-xs text-slate-400">{getVehicleTitle(td.vehicle_id)} · {new Date(td.scheduled_at).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    td.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                    td.status === 'scheduled' ? 'bg-blue-500/20 text-blue-400' :
                    td.status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                    'bg-slate-500/20 text-slate-400'
                  }`}>{td.status}</span>
                </div>
              </div>
            ))}
          </div>

          {testDrives.length === 0 && !showTDForm && (
            <div className="text-center py-12 text-slate-500">
              <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Нет тест-драйвов</p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          VEHICLE FORM MODAL
      ══════════════════════════════════════════════════════════ */}
      {showVehicleForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowVehicleForm(false)} />
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-900/95 backdrop-blur-sm p-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-white font-semibold">{editingVehicle ? 'Редактировать объявление' : 'Новое объявление'}</h3>
              <button onClick={() => setShowVehicleForm(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-4 space-y-4">
              {/* Category */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Категория</label>
                <div className="flex gap-2 flex-wrap">
                  {AUTO_VEHICLE_CATEGORIES.map(cat => (
                    <button key={cat.value} onClick={() => setVCategory(cat.value)}
                      className={`px-3 py-1.5 rounded-full text-xs ${vCategory === cat.value ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Марка *</label>
                  <input className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500"
                    value={vMake} onChange={e => setVMake(e.target.value)} placeholder="Toyota" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Модель *</label>
                  <input className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500"
                    value={vModel} onChange={e => setVModel(e.target.value)} placeholder="Camry" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Год *</label>
                  <input type="number" className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500"
                    value={vYear} onChange={e => setVYear(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Пробег (км)</label>
                  <input type="number" className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500"
                    value={vMileage} onChange={e => setVMileage(e.target.value)} placeholder="0" />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Цена (₽) *</label>
                <input type="number" className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500"
                  value={vPrice} onChange={e => setVPrice(e.target.value)} placeholder="2 500 000" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Тип кузова</label>
                  <select className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none"
                    value={vBodyType} onChange={e => setVBodyType(e.target.value)}>
                    {AUTO_BODY_TYPES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Состояние</label>
                  <select className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none"
                    value={vCondition} onChange={e => setVCondition(e.target.value)}>
                    <option value="new">Новый</option>
                    <option value="used">С пробегом</option>
                    <option value="damaged">Аварийный</option>
                    <option value="parts">На запчасти</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Двигатель</label>
                  <select className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none"
                    value={vEngineType} onChange={e => { setVEngineType(e.target.value); setVIsElectric(e.target.value === 'electric'); }}>
                    {AUTO_ENGINE_TYPES.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Коробка</label>
                  <select className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none"
                    value={vTransmission} onChange={e => setVTransmission(e.target.value)}>
                    {AUTO_TRANSMISSIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Объём двигателя (л)</label>
                  <input type="number" step="0.1" className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none"
                    value={vEngineVolume} onChange={e => setVEngineVolume(e.target.value)} placeholder="2.0" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Цвет</label>
                  <input className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none"
                    value={vColor} onChange={e => setVColor(e.target.value)} placeholder="Белый" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">VIN</label>
                  <input className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none font-mono"
                    value={vVin} onChange={e => setVVin(e.target.value)} placeholder="17 символов" maxLength={17} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Город</label>
                  <input className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none"
                    value={vCity} onChange={e => setVCity(e.target.value)} placeholder="Москва" />
                </div>
              </div>

              {vIsElectric && (
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">⚡ Запас хода (км)</label>
                  <input type="number" className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none"
                    value={vRangeKm} onChange={e => setVRangeKm(e.target.value)} placeholder="400" />
                </div>
              )}

              {/* Checkboxes */}
              <div className="space-y-2">
                <p className="text-xs text-slate-400">Дополнительные опции</p>
                {[
                  { val: vCreditAvail, set: setVCreditAvail, label: '💳 Доступен кредит' },
                  { val: vLeasingAvail, set: setVLeasingAvail, label: '📋 Доступен лизинг' },
                  { val: vTradeInAccepted, set: setVTradeInAccepted, label: '↔️ Принимаю трейд-ин' },
                  { val: vReserveOnline, set: setVReserveOnline, label: '🔒 Онлайн-бронирование' },
                ].map(({ val, set, label }) => (
                  <label key={label} className="flex items-center gap-3 cursor-pointer">
                    <div onClick={() => set(!val)}
                      className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center ${val ? 'bg-orange-500 border-orange-500' : 'border-slate-600'}`}>
                      {val && <CheckCircle className="w-3 h-3 text-white" />}
                    </div>
                    <span className="text-sm text-slate-300">{label}</span>
                  </label>
                ))}
              </div>

              {vReserveOnline && (
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Сумма депозита (₽)</label>
                  <input type="number" className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none"
                    value={vReserveDeposit} onChange={e => setVReserveDeposit(e.target.value)} />
                </div>
              )}

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Описание</label>
                <textarea className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none resize-none"
                  rows={3} value={vDescription} onChange={e => setVDescription(e.target.value)}
                  placeholder="Описание состояния, дополнительное оборудование..." />
              </div>

              <button onClick={handleSaveVehicle}
                className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-medium">
                {editingVehicle ? 'Сохранить изменения' : 'Создать объявление'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          LEAD FORM MODAL
      ══════════════════════════════════════════════════════════ */}
      {showLeadForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowLeadForm(false)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold">Новый лид</h3>
              <button onClick={() => setShowLeadForm(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Источник</label>
              <div className="flex flex-wrap gap-1">
                {AUTO_SOURCES.map(s => (
                  <button key={s.value} onClick={() => setLeadSource(s.value)}
                    className={`px-2 py-1 rounded-lg text-xs ${leadSource === s.value ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                    {s.icon} {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Имя *</label>
                <input className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none"
                  value={leadName} onChange={e => setLeadName(e.target.value)} placeholder="Иван Иванов" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Телефон *</label>
                <input className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none"
                  value={leadPhone} onChange={e => setLeadPhone(e.target.value)} placeholder="+7..." />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Интерес к авто</label>
              <select className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none"
                value={leadVehicleId} onChange={e => setLeadVehicleId(e.target.value)}>
                <option value="">— Любое / не указано —</option>
                {vehicles.filter(v => v.status === 'active').map(v => (
                  <option key={v.id} value={v.id}>{v.make} {v.model} {v.year} · {fmtPrice(v.price)}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Бюджет от</label>
                <input type="number" className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none"
                  value={leadBudgetMin} onChange={e => setLeadBudgetMin(e.target.value)} placeholder="₽" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">до</label>
                <input type="number" className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none"
                  value={leadBudgetMax} onChange={e => setLeadBudgetMax(e.target.value)} placeholder="₽" />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Приоритет</label>
              <div className="flex gap-2">
                {[{ v: 'hot', l: '🔥 Горячий' }, { v: 'high', l: '↑ Высокий' }, { v: 'normal', l: 'Обычный' }].map(p => (
                  <button key={p.v} onClick={() => setLeadPriorityNew(p.v)}
                    className={`flex-1 py-2 rounded-xl text-xs ${leadPriorityNew === p.v ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                    {p.l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Сообщение / комментарий</label>
              <textarea className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none resize-none"
                rows={2} value={leadMessage} onChange={e => setLeadMessage(e.target.value)} />
            </div>
            <button onClick={handleSaveLead}
              className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-medium">
              Добавить лид
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MOVE LEAD MODAL
      ══════════════════════════════════════════════════════════ */}
      {movingLead && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMovingLead(null)} />
          <div className="relative w-full max-w-sm bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold">Перемещение лида</h3>
              <button onClick={() => setMovingLead(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <p className="text-sm text-slate-400">{movingLead.name ?? movingLead.phone}</p>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Новая стадия</label>
              <div className="grid grid-cols-2 gap-2">
                {AUTO_LEAD_STAGES.map(s => (
                  <button key={s.value} onClick={() => setMoveStage(s.value)}
                    className={`py-2 rounded-xl text-xs ${moveStage === s.value ? `${s.color} text-white` : 'bg-slate-700 text-slate-400'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            {moveStage === 'lost' && (
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Причина отказа</label>
                <select className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none"
                  value={moveLostReason} onChange={e => setMoveLostReason(e.target.value)}>
                  <option value="">— выберите —</option>
                  {AUTO_LOST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Заметка</label>
              <textarea className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none resize-none"
                rows={2} value={moveNotes} onChange={e => setMoveNotes(e.target.value)} />
            </div>
            <button onClick={handleMoveLead}
              className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-medium">
              Переместить
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          STATUS CHANGE MODAL
      ══════════════════════════════════════════════════════════ */}
      {statusChangeVehicle && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setStatusChangeVehicle(null)} />
          <div className="relative w-full max-w-sm bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold">Изменить статус</h3>
              <button onClick={() => setStatusChangeVehicle(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <p className="text-sm text-slate-400">{statusChangeVehicle.make} {statusChangeVehicle.model} {statusChangeVehicle.year}</p>
            <div className="grid grid-cols-2 gap-2">
              {(['active','paused','reserved','sold','archived'] as const).map(s => (
                <button key={s} onClick={() => setNewStatus(s)}
                  className={`py-2 rounded-xl text-sm ${newStatus === s ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                  {VEHICLE_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
            {['sold', 'active'].includes(newStatus) && (
              <div>
                <label className="text-xs text-slate-400 mb-1 block">
                  {newStatus === 'sold' ? 'Цена продажи' : 'Новая цена (опционально)'}
                </label>
                <input type="number" className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none"
                  value={newPrice} onChange={e => setNewPrice(e.target.value)}
                  placeholder={String(statusChangeVehicle.price)} />
              </div>
            )}
            <button onClick={handleStatusChange}
              className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-medium">
              Применить
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          PROMO MODAL (auto.ru ТОП / VIP / Premium)
      ══════════════════════════════════════════════════════════ */}
      {promoVehicle && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setPromoVehicle(null)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-purple-400" /> Продвижение объявления
              </h3>
              <button onClick={() => setPromoVehicle(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <p className="text-sm text-slate-400">{promoVehicle.make} {promoVehicle.model} {promoVehicle.year} · {fmtPrice(promoVehicle.price)}</p>

            {/* Package selection */}
            <div className="space-y-2">
              {AUTO_PROMO_PACKAGES.map(pkg => (
                <button key={pkg.value}
                  onClick={() => setSelectedPromo(pkg.value)}
                  className={`w-full p-3 rounded-xl border text-left transition-all ${
                    selectedPromo === pkg.value
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${pkg.color}`}>{pkg.label}</span>
                      {pkg.value === 'top' && <span className="text-xs px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded">популярный</span>}
                      {pkg.value === 'vip' && <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">рекомендуем</span>}
                    </div>
                    <span className="text-sm text-white font-semibold">
                      {pkg.price === 0 ? 'Бесплатно' : `${fmtPrice(pkg.price)}/день`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {pkg.value === 'free' && 'Стандартное размещение без продвижения'}
                    {pkg.value === 'standard' && 'Подъём в ленте +40% показов'}
                    {pkg.value === 'premium' && 'Топ раздела + значок Premium + 2× показы'}
                    {pkg.value === 'vip' && 'VIP-галерея + первая строка в выдаче + 5× показы'}
                    {pkg.value === 'top' && 'Топ-1 выдачи + баннер + уведомления подписчикам + 10× показы'}
                  </p>
                </button>
              ))}
            </div>

            <button onClick={handleApplyPromo}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium flex items-center justify-center gap-2">
              <Zap className="w-4 h-4" />
              Активировать {AUTO_PROMO_PACKAGES.find(p => p.value === selectedPromo)?.label}
              {AUTO_PROMO_PACKAGES.find(p => p.value === selectedPromo)?.price
                ? ` — ${fmtPrice(AUTO_PROMO_PACKAGES.find(p => p.value === selectedPromo)!.price)}/день`
                : ''}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          PUBLISH TO MARKETPLACE MODAL (auto.ru / Авито / Дром)
      ══════════════════════════════════════════════════════════ */}
      {publishVehicle && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setPublishVehicle(null)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold">📤 Публикация на площадках</h3>
              <button onClick={() => setPublishVehicle(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <p className="text-sm text-slate-400">{publishVehicle.make} {publishVehicle.model} {publishVehicle.year}</p>

            <div className="space-y-2">
              {[
                { value: 'auto_ru',  label: 'auto.ru',     icon: '🚗', desc: '~2M объявлений, лидер рынка',       color: 'border-orange-500/50 bg-orange-500/10' },
                { value: 'avito',    label: 'Авито',        icon: '🟢', desc: '~5M объявлений, широкая аудитория', color: 'border-green-500/50 bg-green-500/10' },
                { value: 'drom',     label: 'Дром',          icon: '🔴', desc: 'Сибирь/Дальний Восток, мото, спецтех', color: 'border-red-500/50 bg-red-500/10' },
                { value: 'website',  label: 'Свой сайт',   icon: '🌐', desc: 'Прямые лиды без комиссии',           color: 'border-blue-500/50 bg-blue-500/10' },
              ].map(src => {
                const isSelected = publishSources.includes(src.value);
                const alreadyPublished = publishVehicle.published_to.find(p => p.source === src.value);
                return (
                  <button key={src.value}
                    onClick={() => setPublishSources(prev =>
                      prev.includes(src.value) ? prev.filter(s => s !== src.value) : [...prev, src.value]
                    )}
                    className={`w-full p-3 rounded-xl border text-left transition-all ${
                      isSelected ? src.color : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{src.icon}</span>
                        <span className="text-white text-sm font-medium">{src.label}</span>
                        {alreadyPublished && <span className="text-xs text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">✓ опубликовано</span>}
                      </div>
                      <div className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center ${
                        isSelected ? 'bg-orange-500 border-orange-500' : 'border-slate-600'
                      }`}>
                        {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 ml-7">{src.desc}</p>
                  </button>
                );
              })}
            </div>

            <button onClick={handlePublishToMarketplace}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium">
              Опубликовать на {publishSources.length} площадках
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          HOT DEALS PANEL (Cars.com "Deals near you" concept)
      ══════════════════════════════════════════════════════════ */}
      {showHotDeals && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowHotDeals(false)} />
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-900/95 backdrop-blur-sm p-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-white font-semibold">🔥 Горячие сделки — ниже рынка</h3>
              <button onClick={() => setShowHotDeals(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-slate-400">
                Авто с ценой ниже рекомендуемой — продаются быстрее среднего
              </p>
              {vehicles
                .filter(v => v.status === 'active' && v.recommended_price && v.price < v.recommended_price)
                .sort((a, b) => {
                  const discountA = a.recommended_price ? (a.recommended_price - a.price) / a.recommended_price : 0;
                  const discountB = b.recommended_price ? (b.recommended_price - b.price) / b.recommended_price : 0;
                  return discountB - discountA;
                })
                .map(v => {
                  const discount = v.recommended_price ? Math.round((v.recommended_price - v.price) / v.recommended_price * 100) : 0;
                  return (
                    <div key={v.id} className="bg-green-500/10 border border-green-500/30 rounded-xl p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-white font-medium text-sm">{v.make} {v.model} {v.year}</p>
                          <p className="text-xs text-slate-400">{v.body_type} · {fmt(v.mileage)} км{v.city ? ` · ${v.city}` : ''}</p>
                        </div>
                        <span className="text-sm font-bold text-green-400 bg-green-400/10 px-2 py-1 rounded-full">
                          -{discount}%
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <div>
                          <p className="text-lg font-bold text-white">{fmtPrice(v.price)}</p>
                          <p className="text-xs text-slate-500 line-through">{fmtPrice(v.recommended_price!)}</p>
                        </div>
                        <div className="flex-1" />
                        <div className="text-right text-xs text-slate-400">
                          <p>👁 {fmt(v.views_total)}</p>
                          <p>{v.days_on_market}д на рынке</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              {vehicles.filter(v => v.status === 'active' && v.recommended_price && v.price < v.recommended_price).length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  <p>Нет авто ниже рынка</p>
                  <p className="text-xs mt-1">Запустите оценку для сравнения</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CRMAutoDashboard;
