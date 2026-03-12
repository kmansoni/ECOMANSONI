/**
 * CRMHRDashboard — полнофункциональный HR / Recruiting ATS.
 *
 * Реализованные модули (сопоставление с конкурентами):
 *
 * ✓ hh.ru Работодатель:
 *   - База вакансий с ЗП вилкой, грейдом, типом занятости, дедлайном
 *   - Воронка кандидатов по вакансии (pipeline по стадиям)
 *   - Источники кандидатов с аналитикой
 *   - Статусы: новый → скрининг → звонок HR → интервью → оффер → принят/отказ
 *
 * ✓ rabota.ru ATS:
 *   - Scorecard оценки кандидата (компетенции 1-5)
 *   - Ответственный рекрутер
 *   - Запись заметок по каждому кандидату
 *   - Теги кандидатов
 *   - Черный список с причиной
 *
 * ✓ SuperJob:
 *   - Грейды (intern/junior/middle/senior/lead/principal)
 *   - Уровень английского
 *   - Обязательные vs желательные навыки
 *   - Готовность к переезду и формат работы
 *   - Тестовое задание как стадия
 *
 * ✓ Greenhouse / Lever (международные ATS):
 *   - Оффер-менеджмент (ЗП оффера, дата выхода, испытательный срок, бонусы)
 *   - Статусы оффера (черновик/отправлен/принят/отклонён)
 *   - Интервью с типами (HR/тех/финал/тестовое)
 *   - Scorecard по компетенциям
 *   - Time-to-hire метрика
 *   - Offer accept rate
 */
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Users, Briefcase, CheckCircle, Clock, TrendingUp, Plus,
  Phone, Mail, Search, ChevronRight, X, Star, AlertTriangle, Edit2,
  Trash2, Eye, Calendar, Target, BarChart2, Award, RefreshCw,
  MessageSquare, Linkedin, ExternalLink, Flag, Gift,
  FileText, Building2, Sparkles, FileCheck, Send, Bot, Heart
} from "lucide-react";
import {
  crm, type HRJob, type HRCandidate, type HRApplication, type HRInterview,
  type HROffer, type HRDashboardStats, type HRScorecardItem,
  type HRTemplate, type HROnboarding, type HROnboardingTask,
  type HREmploymentDoc, type HREmployerBrand,
  HR_SOURCES, HR_REJECT_REASONS, HR_COMPETENCIES, HR_APP_STAGES,
  EMPLOYMENT_DOC_TYPES, ONBOARDING_CATEGORIES, AI_VERDICT_CONFIG,
} from "@/lib/crm";
import { CRMHRJobForm } from "@/components/crm/CRMHRJobForm";
import { CRMHRCandidateForm } from "@/components/crm/CRMHRCandidateForm";

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = 'dashboard' | 'jobs' | 'candidates' | 'pipeline' | 'interviews' | 'offers'
         | 'onboarding' | 'documents' | 'templates' | 'brand';

const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: 'Полная', part_time: 'Частичная', remote: 'Удалённо',
  hybrid: 'Гибрид', contract: 'Контракт', internship: 'Стажировка', freelance: 'Фриланс',
};

const JOB_STATUS_COLORS: Record<string, string> = {
  open: 'text-green-400 bg-green-400/10',
  draft: 'text-slate-400 bg-slate-400/10',
  paused: 'text-yellow-400 bg-yellow-400/10',
  closed: 'text-red-400 bg-red-400/10',
  archived: 'text-slate-500 bg-slate-500/10',
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'text-red-400', high: 'text-amber-400', normal: 'text-slate-400', low: 'text-slate-500',
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: '🔥 Срочно', high: '↑ Высокий', normal: 'Обычный', low: '↓ Низкий',
};

const RECOMMENDATION_LABELS: Record<string, string> = {
  strong_yes: '💚 Очень ДА', yes: '✓ ДА', hold: '⏸ Ожидание', no: '✗ НЕТ', strong_no: '❌ Очень НЕТ',
};

const RECOMMENDATION_COLORS: Record<string, string> = {
  strong_yes: 'text-green-400', yes: 'text-emerald-400', hold: 'text-yellow-400',
  no: 'text-red-400', strong_no: 'text-red-600',
};

const SOURCE_LABELS: Record<string, string> = Object.fromEntries(HR_SOURCES.map(s => [s.value, s.label]));

// ─── Component ────────────────────────────────────────────────────────────────
export function CRMHRDashboard() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Data
  const [stats, setStats] = useState<HRDashboardStats | null>(null);
  const [jobs, setJobs] = useState<HRJob[]>([]);
  const [candidates, setCandidates] = useState<HRCandidate[]>([]);
  const [applications, setApplications] = useState<HRApplication[]>([]);
  const [interviews, setInterviews] = useState<HRInterview[]>([]);
  const [offers, setOffers] = useState<HROffer[]>([]);

  // Advanced modules state
  const [templates, setTemplates] = useState<HRTemplate[]>([]);
  const [onboardings, setOnboardings] = useState<HROnboarding[]>([]);
  const [employmentDocs, setEmploymentDocs] = useState<HREmploymentDoc[]>([]);
  const [employerBrand, setEmployerBrand] = useState<HREmployerBrand | null>(null);

  // Templates editor
  const [editingTemplate, setEditingTemplate] = useState<HRTemplate | null>(null);
  const [tplName, setTplName] = useState('');
  const [tplCategory, setTplCategory] = useState('invitation');
  const [tplSubject, setTplSubject] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [tplPreviewCandidate, setTplPreviewCandidate] = useState('');

  // Employer brand editor
  const [brandEnps, setBrandEnps] = useState('');
  const [brandRating, setBrandRating] = useState('');
  const [brandEvp, setBrandEvp] = useState('');
  const [brandAwards, setBrandAwards] = useState('');
  const [editingBrand, setEditingBrand] = useState(false);

  // Docs filter
  const [docsFilter, setDocsFilter] = useState<string>('all');
  const [docsCandidate, setDocsCandidate] = useState<string>('all');

  // Modals
  const [showJobForm, setShowJobForm] = useState(false);
  const [editingJob, setEditingJob] = useState<HRJob | null>(null);
  const [showCandidateForm, setShowCandidateForm] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<HRCandidate | null>(null);

  // Pipeline view
  const [pipelineJobId, setPipelineJobId] = useState<string | null>(null);
  const [pipelineStageFilter, setPipelineStageFilter] = useState<string | null>(null);

  // Application move modal
  const [movingApp, setMovingApp] = useState<HRApplication | null>(null);
  const [moveStage, setMoveStage] = useState('');
  const [moveNotes, setMoveNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [moveScore, setMoveScore] = useState('');

  // Interview scorecard modal
  const [scorecardInterview, setScorecardInterview] = useState<HRInterview | null>(null);
  const [scorecard, setScorecard] = useState<HRScorecardItem[]>([]);
  const [interviewFeedback, setInterviewFeedback] = useState('');
  const [interviewRec, setInterviewRec] = useState('');

  // Add to vacancy modal
  const [addToPipelineCandidate, setAddToPipelineCandidate] = useState<HRCandidate | null>(null);
  const [addToJobId, setAddToJobId] = useState('');

  // Offer modal
  const [offerApp, setOfferApp] = useState<HRApplication | null>(null);
  const [offerSalary, setOfferSalary] = useState('');
  const [offerStartDate, setOfferStartDate] = useState('');
  const [offerProbation, setOfferProbation] = useState('3');
  const [offerBonuses, setOfferBonuses] = useState('');

  // Load data
  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      crm.setProfession('hr');
      const [statsData, jobsData, cands, apps, ints, tpls, onbs, docs, brand] = await Promise.all([
        crm.getHRDashboardStats(),
        crm.getHRJobs(),
        crm.getHRCandidates(),
        crm.getHRApplications(),
        crm.getHRInterviews(),
        crm.getHRTemplates(),
        crm.getHROnboarding(),
        crm.getAllHREmploymentDocs(),
        crm.getEmployerBrand(),
      ]);
      setStats(statsData);
      setJobs(jobsData);
      setCandidates(cands);
      setApplications(apps);
      setInterviews(ints);
      setTemplates(tpls);
      setOnboardings(onbs);
      setEmploymentDocs(docs);
      setEmployerBrand(brand);
    } catch (err) {
      console.error('HR load error:', err);
      if (!silent) toast.error('Ошибка загрузки HR данных');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleDeleteJob = async (id: string) => {
    if (!confirm('Удалить вакансию? Все заявки по ней будут удалены.')) return;
    try {
      await crm.deleteHRJob(id);
      setJobs(prev => prev.filter(j => j.id !== id));
      toast.success('Вакансия удалена');
    } catch { toast.error('Ошибка удаления'); }
  };

  const handleMoveApp = async () => {
    if (!movingApp || !moveStage) return;
    try {
      const updated = await crm.moveHRApplicationStage(
        movingApp.id, moveStage, moveNotes || undefined,
        rejectReason || undefined,
        moveScore ? parseInt(moveScore) : undefined
      );
      setApplications(prev => prev.map(a => a.id === updated.id ? updated : a));
      toast.success(`Перемещён на стадию: ${HR_APP_STAGES.find(s => s.value === moveStage)?.label ?? moveStage}`);
      setMovingApp(null);
      setMoveStage(''); setMoveNotes(''); setRejectReason(''); setMoveScore('');
    } catch { toast.error('Ошибка перемещения'); }
  };

  const handleCompleteScorecard = async () => {
    if (!scorecardInterview) return;
    try {
      const updated = await crm.completeHRInterview(scorecardInterview.id, {
        scorecard,
        overallScore: scorecard.length > 0 ? Math.round(scorecard.reduce((a, c) => a + c.score, 0) / scorecard.length) : undefined,
        recommendation: interviewRec || undefined,
        feedback: interviewFeedback || undefined,
      });
      setInterviews(prev => prev.map(i => i.id === updated.id ? updated : i));
      toast.success('Оценка сохранена');
      setScorecardInterview(null);
    } catch { toast.error('Ошибка сохранения оценки'); }
  };

  const handleAddToVacancy = async () => {
    if (!addToPipelineCandidate || !addToJobId) { toast.error('Выберите вакансию'); return; }
    try {
      const app = await crm.createHRApplication(addToJobId, addToPipelineCandidate.id);
      setApplications(prev => [...prev, app]);
      toast.success('Кандидат добавлен в воронку');
      setAddToPipelineCandidate(null);
      setAddToJobId('');
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? '';
      if (msg.includes('unique')) toast.error('Кандидат уже есть в этой вакансии');
      else toast.error('Ошибка добавления');
    }
  };

  const handleCreateOffer = async () => {
    if (!offerApp || !offerSalary) { toast.error('Укажите ЗП оффера'); return; }
    const candidate = candidates.find(c => c.id === offerApp.candidate_id);
    try {
      const offer = await crm.createHROffer({
        applicationId:   offerApp.id,
        candidateId:     offerApp.candidate_id,
        jobId:           offerApp.job_id,
        offeredSalary:   parseInt(offerSalary),
        startDate:       offerStartDate || undefined,
        probationMonths: parseInt(offerProbation) || 3,
        bonuses:         offerBonuses || undefined,
      });
      setOffers(prev => [...prev, offer]);
      // Move application to offer stage
      const updatedApp = await crm.moveHRApplicationStage(offerApp.id, 'offer');
      setApplications(prev => prev.map(a => a.id === updatedApp.id ? updatedApp : a));
      toast.success(`Оффер создан для ${candidate?.name ?? 'кандидата'}`);
      setOfferApp(null);
      setOfferSalary(''); setOfferStartDate(''); setOfferProbation('3'); setOfferBonuses('');
    } catch { toast.error('Ошибка создания оффера'); }
  };

  const handleOfferStatusChange = async (offerId: string, status: string) => {
    try {
      const updated = await crm.updateHROfferStatus(offerId, status);
      setOffers(prev => prev.map(o => o.id === updated.id ? updated : o));
      if (status === 'accepted') {
        // Move application to hired
        const offer = offers.find(o => o.id === offerId);
        if (offer) {
          const updatedApp = await crm.moveHRApplicationStage(offer.application_id, 'hired');
          setApplications(prev => prev.map(a => a.id === updatedApp.id ? updatedApp : a));
        }
        toast.success('🎉 Оффер принят! Кандидат нанят');
      } else {
        toast.success(`Оффер: ${status === 'declined' ? 'отклонён кандидатом' : status}`);
      }
    } catch { toast.error('Ошибка обновления оффера'); }
  };

  // ─── Computed ──────────────────────────────────────────────────────────────

  const filteredJobs = jobs.filter(j =>
    !searchQuery ||
    j.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    j.department?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCandidates = candidates.filter(c =>
    !searchQuery ||
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.current_company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.skills.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const pipelineApps = applications.filter(a =>
    (!pipelineJobId || a.job_id === pipelineJobId) &&
    (!pipelineStageFilter || a.stage === pipelineStageFilter)
  );

  const getCandidateName = (id: string) => candidates.find(c => c.id === id)?.name ?? '—';
  const getJobTitle = (id: string) => jobs.find(j => j.id === id)?.title ?? '—';

  const todayInterviews = interviews.filter(i => {
    const d = new Date(i.scheduled_at);
    return d.toDateString() === new Date().toDateString() && i.status === 'scheduled';
  });

  const appsByStage = HR_APP_STAGES.reduce((acc, s) => {
    acc[s.value] = applications.filter(a => a.stage === s.value);
    return acc;
  }, {} as Record<string, HRApplication[]>);

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500" />
      </div>
    );
  }

  // ─── Tab config ────────────────────────────────────────────────────────────

  // ─── Advanced module handlers ──────────────────────────────────────────────

  const handleSaveTemplate = async () => {
    if (!tplName || !tplBody) { toast.error('Заполните название и текст шаблона'); return; }
    try {
      const saved = await crm.upsertHRTemplate({
        id:       editingTemplate?.id,
        name:     tplName,
        category: tplCategory as HRTemplate['category'],
        subject:  tplSubject || undefined,
        body:     tplBody,
      });
      setTemplates(prev => {
        const idx = prev.findIndex(t => t.id === saved.id);
        return idx >= 0 ? prev.map(t => t.id === saved.id ? saved : t) : [...prev, saved];
      });
      toast.success('Шаблон сохранён');
      setEditingTemplate(null); setTplName(''); setTplCategory('invitation'); setTplSubject(''); setTplBody('');
    } catch { toast.error('Ошибка сохранения шаблона'); }
  };

  const handleSeedTemplates = async () => {
    try {
      await crm.seedHRTemplates();
      const tpls = await crm.getHRTemplates();
      setTemplates(tpls);
      toast.success(`Загружено ${tpls.length} шаблонов по умолчанию`);
    } catch { toast.error('Ошибка загрузки шаблонов'); }
  };

  const handleToggleOnboardingTask = async (onboardingId: string, taskId: string, completed: boolean) => {
    try {
      const updated = await crm.updateHROnboardingTask(onboardingId, taskId, completed);
      setOnboardings(prev => prev.map(o => o.id === updated.id ? updated : o));
    } catch { toast.error('Ошибка обновления задачи'); }
  };

  const handleCreateOnboarding = async (candidateId: string, jobId: string) => {
    const app = applications.find(a => a.candidate_id === candidateId && a.job_id === jobId);
    try {
      const ob = await crm.createHROnboarding({
        candidateId,
        applicationId: app?.id ?? '',
        jobId,
        startDate: new Date().toISOString().slice(0, 10),
      });
      setOnboardings(prev => [...prev, ob]);
      toast.success('Онбординг создан');
    } catch { toast.error('Ошибка создания онбординга'); }
  };

  const handleUpsertDoc = async (
    candidateId: string,
    docType: HREmploymentDoc['doc_type'],
    title: string,
    status: HREmploymentDoc['status'],
    sendMethod: HREmploymentDoc['send_method']
  ) => {
    try {
      const doc = await crm.upsertHREmploymentDoc({ candidate_id: candidateId, doc_type: docType, title, status, send_method: sendMethod });
      setEmploymentDocs(prev => {
        const idx = prev.findIndex(d => d.id === doc.id);
        return idx >= 0 ? prev.map(d => d.id === doc.id ? doc : d) : [...prev, doc];
      });
      toast.success('Документ обновлён');
    } catch { toast.error('Ошибка обновления документа'); }
  };

  const handleSaveBrand = async () => {
    try {
      const saved = await crm.upsertEmployerBrand({
        company_name:     employerBrand?.company_name ?? 'Компания',
        enps_score:       brandEnps ? parseInt(brandEnps) : undefined,
        dreamjob_rating:  brandRating ? parseFloat(brandRating) : undefined,
        evp_items:        brandEvp
          ? brandEvp.split('\n').filter(Boolean).map(t => ({ category: 'culture' as const, title: t, highlight: false }))
          : [],
        awards:           brandAwards ? brandAwards.split('\n').filter(Boolean) : [],
      });
      setEmployerBrand(saved);
      setEditingBrand(false);
      toast.success('Бренд работодателя обновлён');
    } catch { toast.error('Ошибка сохранения бренда'); }
  };

  const handleComputeAIScore = async (appId: string) => {
    try {
      const updated = await crm.computeHRAIScore(appId);
      setApplications(prev => prev.map(a => a.id === updated.id ? updated : a));
      const verdictMap: Record<string, string> = {
        strong_match: '💚 Отличное совпадение', good_match: '✓ Хорошее', partial_match: '⚡ Частичное',
        weak_match: '⚠ Слабое', no_match: '✗ Не подходит',
      };
      toast.success(`AI оценка: ${updated.ai_score ?? 0}% — ${verdictMap[updated.ai_verdict ?? ''] ?? ''}`);
    } catch { toast.error('Ошибка AI оценки'); }
  };

  const TABS: Array<{ id: Tab; label: string; badge?: number }> = [
    { id: 'dashboard',   label: 'Дашборд' },
    { id: 'jobs',        label: 'Вакансии',   badge: stats?.open_jobs },
    { id: 'candidates',  label: 'Кандидаты',  badge: stats?.new_candidates_week },
    { id: 'pipeline',    label: 'Воронка',    badge: stats?.active_applications },
    { id: 'interviews',  label: 'Интервью',   badge: todayInterviews.length || undefined },
    { id: 'offers',      label: 'Офферы',     badge: stats?.offers_sent || undefined },
    { id: 'onboarding',  label: '🚀 Онбординг', badge: onboardings.filter(o => o.tasks.some((t: HROnboardingTask) => !t.completed)).length || undefined },
    { id: 'documents',   label: '📄 КЭДО',    badge: employmentDocs.filter(d => d.status === 'pending').length || undefined },
    { id: 'templates',   label: '✉️ Шаблоны', badge: templates.length || undefined },
    { id: 'brand',       label: '🏆 Бренд' },
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
            <h1 className="text-xl font-bold text-white">HR / Рекрутинг</h1>
            {stats && (
              <p className="text-xs text-slate-400">
                {stats.open_jobs} вакансий · {stats.total_candidates} кандидатов
                {stats.avg_time_to_hire_days ? ` · ${stats.avg_time_to_hire_days}д time-to-hire` : ''}
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
                activeTab === tab.id ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-slate-700 text-slate-300 rounded-full text-xs">{tab.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          DASHBOARD
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'dashboard' && stats && (
        <div className="p-4 space-y-6">
          {/* KPI Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/20 rounded-lg"><Briefcase className="w-5 h-5 text-indigo-400" /></div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.open_jobs}</p>
                  <p className="text-xs text-slate-400">Открытых вакансий</p>
                  {stats.urgent_jobs > 0 && <p className="text-xs text-red-400">🔥 {stats.urgent_jobs} срочных</p>}
                </div>
              </div>
            </div>
            <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/20 rounded-lg"><Users className="w-5 h-5 text-purple-400" /></div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.total_candidates}</p>
                  <p className="text-xs text-slate-400">Кандидатов</p>
                  <p className="text-xs text-slate-500">+{stats.new_candidates_week} за нед.</p>
                </div>
              </div>
            </div>
            <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg"><CheckCircle className="w-5 h-5 text-green-400" /></div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.hired_this_month}</p>
                  <p className="text-xs text-slate-400">Нанято за месяц</p>
                  <p className="text-xs text-slate-500">всего {stats.hired_total}</p>
                </div>
              </div>
            </div>
            <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 rounded-lg"><Target className="w-5 h-5 text-amber-400" /></div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.offer_accept_rate}%</p>
                  <p className="text-xs text-slate-400">Accept Rate офферов</p>
                  <p className="text-xs text-slate-500">{stats.offers_accepted}/{stats.offers_accepted + stats.offers_sent} принято</p>
                </div>
              </div>
            </div>
          </div>

          {/* Time-to-hire */}
          {stats.avg_time_to_hire_days && (
            <div className="p-4 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 rounded-2xl border border-indigo-500/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-indigo-400/70">⏱ Среднее время найма</p>
                  <p className="text-2xl font-bold text-indigo-400">{stats.avg_time_to_hire_days} дней</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">В работе</p>
                  <p className="text-xl font-bold text-slate-300">{stats.active_applications}</p>
                  <p className="text-xs text-slate-500">заявок</p>
                </div>
              </div>
            </div>
          )}

          {/* Today interviews */}
          {todayInterviews.length > 0 && (
            <div onClick={() => setActiveTab('interviews')} className="cursor-pointer p-4 bg-cyan-500/10 rounded-2xl border border-cyan-500/30 flex items-center gap-3">
              <Calendar className="w-5 h-5 text-cyan-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-cyan-400 font-medium">Интервью сегодня</p>
                <p className="text-sm text-cyan-400/70">{todayInterviews.length} запланированных</p>
              </div>
              <ChevronRight className="w-4 h-4 text-cyan-400/50" />
            </div>
          )}

          {/* Pipeline funnel */}
          {stats.funnel && stats.funnel.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-400" /> Воронка подбора
              </h2>
              <div className="space-y-2">
                {stats.funnel.map(item => {
                  const stageConf = HR_APP_STAGES.find(s => s.value === item.stage);
                  const maxCount = Math.max(...(stats.funnel?.map(f => f.count) ?? [1]));
                  const pct = maxCount > 0 ? Math.round(item.count / maxCount * 100) : 0;
                  return (
                    <div key={item.stage}
                      onClick={() => { setActiveTab('pipeline'); setPipelineStageFilter(item.stage); }}
                      className="cursor-pointer flex items-center gap-3 p-3 bg-slate-800/80 rounded-xl border border-slate-700/50 hover:border-slate-600">
                      <span className="text-sm text-slate-300 w-32 flex-shrink-0">{stageConf?.label ?? item.stage}</span>
                      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${stageConf?.color ?? 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-white font-bold text-sm w-6 text-right">{item.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sources */}
          {stats.candidate_sources && stats.candidate_sources.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-purple-400" /> Источники кандидатов
              </h2>
              <div className="space-y-2">
                {stats.candidate_sources.map(s => {
                  const total = stats.candidate_sources.reduce((a, x) => a + x.count, 0);
                  const pct = total > 0 ? Math.round(s.count / total * 100) : 0;
                  return (
                    <div key={s.source} className="flex items-center gap-3">
                      <span className="text-sm text-slate-300 w-28 flex-shrink-0 truncate">{SOURCE_LABELS[s.source] ?? s.source}</span>
                      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-slate-400 w-16 text-right">{s.count} ({pct}%)</span>
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
              <button onClick={() => { setEditingJob(null); setShowJobForm(true); setActiveTab('jobs'); }}
                className="flex items-center gap-3 p-4 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-600/30 rounded-2xl transition-colors">
                <Briefcase className="w-5 h-5 text-indigo-400" />
                <span className="text-indigo-300 font-medium text-sm">Новая вакансия</span>
              </button>
              <button onClick={() => { setEditingCandidate(null); setShowCandidateForm(true); setActiveTab('candidates'); }}
                className="flex items-center gap-3 p-4 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-600/30 rounded-2xl transition-colors">
                <Users className="w-5 h-5 text-purple-400" />
                <span className="text-purple-300 font-medium text-sm">Новый кандидат</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          JOBS TAB
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'jobs' && (
        <div className="p-4 space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
              <input
                className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
                placeholder="Поиск вакансий..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <button onClick={() => { setEditingJob(null); setShowJobForm(true); }}
              className="flex items-center gap-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-white text-sm font-medium">
              <Plus className="w-4 h-4" /> Вакансия
            </button>
          </div>

          {filteredJobs.length === 0 ? (
            <div className="text-center py-12">
              <Briefcase className="w-12 h-12 mx-auto mb-2 text-slate-600" />
              <p className="text-slate-400">Вакансий нет</p>
              <button onClick={() => { setEditingJob(null); setShowJobForm(true); }}
                className="mt-3 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm">
                Создать первую вакансию
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredJobs.map(job => {
                const appCount = applications.filter(a => a.job_id === job.id && !['hired','rejected','archived'].includes(a.stage)).length;
                return (
                  <div key={job.id} className="bg-slate-800/80 rounded-2xl border border-slate-700/50 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-white font-medium">{job.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {job.grade && <span className="text-xs text-indigo-400">{job.grade}</span>}
                              {job.department && <span className="text-xs text-slate-400">• {job.department}</span>}
                            </div>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${JOB_STATUS_COLORS[job.status] ?? ''}`}>
                            {job.status === 'open' ? 'Открыта' : job.status === 'paused' ? 'Пауза' : job.status === 'closed' ? 'Закрыта' : job.status}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          {job.salary_min && !job.salary_hidden && (
                            <span className="text-xs text-green-400">
                              {job.salary_min.toLocaleString()} – {job.salary_max?.toLocaleString() ?? '…'} ₽
                            </span>
                          )}
                          {job.salary_hidden && <span className="text-xs text-slate-400">ЗП не указана</span>}
                          <span className="text-xs text-slate-400">{EMPLOYMENT_LABELS[job.employment_type] ?? job.employment_type}</span>
                          {job.location && <span className="text-xs text-slate-400">{job.location}</span>}
                          <span className={`text-xs ${PRIORITY_COLORS[job.priority] ?? ''}`}>{PRIORITY_LABELS[job.priority] ?? job.priority}</span>
                        </div>

                        {job.required_skills.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {job.required_skills.slice(0, 4).map(s => (
                              <span key={s} className="text-xs bg-indigo-600/20 text-indigo-300 px-2 py-0.5 rounded-full">{s}</span>
                            ))}
                            {job.required_skills.length > 4 && <span className="text-xs text-slate-500">+{job.required_skills.length - 4}</span>}
                          </div>
                        )}

                        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-700/50">
                          <div className="flex items-center gap-1 text-xs text-slate-400">
                            <Users className="w-3 h-3" /> {appCount} в воронке
                            {job.openings > 1 && ` из ${job.openings} мест`}
                          </div>
                          {job.deadline && (
                            <div className={`flex items-center gap-1 text-xs ${
                              new Date(job.deadline) < new Date() ? 'text-red-400' : 'text-slate-400'
                            }`}>
                              <Clock className="w-3 h-3" />
                              {new Date(job.deadline).toLocaleDateString('ru-RU')}
                            </div>
                          )}
                          <button onClick={() => { setPipelineJobId(job.id); setPipelineStageFilter(null); setActiveTab('pipeline'); }}
                            className="ml-auto flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
                            Воронка <ChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button onClick={() => { setEditingJob(job); setShowJobForm(true); }}
                          className="p-1.5 hover:bg-slate-700 rounded-lg"><Edit2 className="w-3.5 h-3.5 text-slate-400" /></button>
                        <button onClick={() => handleDeleteJob(job.id)}
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
          CANDIDATES TAB
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'candidates' && (
        <div className="p-4 space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
              <input
                className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 text-sm"
                placeholder="Поиск по имени, компании, навыкам..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <button onClick={() => { setEditingCandidate(null); setShowCandidateForm(true); }}
              className="flex items-center gap-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded-xl text-white text-sm font-medium">
              <Plus className="w-4 h-4" /> Кандидат
            </button>
          </div>

          {filteredCandidates.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 mx-auto mb-2 text-slate-600" />
              <p className="text-slate-400">Кандидатов нет</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCandidates.map(c => {
                const candApps = applications.filter(a => a.candidate_id === c.id);
                return (
                  <div key={c.id} className={`bg-slate-800/80 rounded-2xl border p-4 ${
                    c.blacklisted ? 'border-red-500/30 opacity-70' :
                    c.vip ? 'border-amber-500/30' : 'border-slate-700/50'
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        c.vip ? 'bg-amber-500/30' : c.blacklisted ? 'bg-red-500/20' : 'bg-purple-500/20'
                      }`}>
                        {c.vip
                          ? <Star className="w-5 h-5 text-amber-400" />
                          : <span className="text-purple-400 font-semibold">{c.name.charAt(0).toUpperCase()}</span>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-white font-medium">{c.name}</p>
                          {c.blacklisted && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">🚫 ЧС</span>}
                          {c.grade && <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full">{c.grade}</span>}
                        </div>
                        {c.current_position && (
                          <p className="text-xs text-slate-400">{c.current_position}{c.current_company ? ` · ${c.current_company}` : ''}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {c.expected_salary && (
                            <span className="text-xs text-green-400">ожидает {c.expected_salary.toLocaleString()} ₽</span>
                          )}
                          {c.experience_years && <span className="text-xs text-slate-400">{c.experience_years} лет опыта</span>}
                          {c.city && <span className="text-xs text-slate-400">{c.city}</span>}
                          {c.english_level && c.english_level !== 'none' && (
                            <span className="text-xs text-blue-400">EN: {c.english_level}</span>
                          )}
                        </div>
                        {c.skills.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {c.skills.slice(0, 5).map(s => (
                              <span key={s} className="text-xs bg-purple-600/20 text-purple-300 px-2 py-0.5 rounded-full">{s}</span>
                            ))}
                            {c.skills.length > 5 && <span className="text-xs text-slate-500">+{c.skills.length - 5}</span>}
                          </div>
                        )}

                        {/* Contact + actions row */}
                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                          {c.phone && (
                            <a href={`tel:${c.phone}`} className="flex items-center gap-1 px-2 py-1 bg-green-600/20 text-green-400 rounded-lg text-xs">
                              <Phone className="w-3 h-3" /> Звонок
                            </a>
                          )}
                          {c.email && (
                            <a href={`mailto:${c.email}`} className="flex items-center gap-1 px-2 py-1 bg-blue-600/20 text-blue-400 rounded-lg text-xs">
                              <Mail className="w-3 h-3" /> Email
                            </a>
                          )}
                          {c.telegram_handle && (
                            <span className="flex items-center gap-1 px-2 py-1 bg-slate-700 text-slate-300 rounded-lg text-xs">
                              <MessageSquare className="w-3 h-3" /> {c.telegram_handle}
                            </span>
                          )}
                          {c.linkedin_url && (
                            <a href={c.linkedin_url} target="_blank" rel="noreferrer"
                              className="flex items-center gap-1 px-2 py-1 bg-blue-700/20 text-blue-400 rounded-lg text-xs">
                              <Linkedin className="w-3 h-3" /> LinkedIn
                            </a>
                          )}
                          {c.resume_url && (
                            <a href={c.resume_url} target="_blank" rel="noreferrer"
                              className="flex items-center gap-1 px-2 py-1 bg-slate-700 text-slate-300 rounded-lg text-xs">
                              <ExternalLink className="w-3 h-3" /> Резюме
                            </a>
                          )}
                          {!c.blacklisted && (
                            <button onClick={() => { setAddToPipelineCandidate(c); setAddToJobId(''); }}
                              className="flex items-center gap-1 px-2 py-1 bg-indigo-600/20 text-indigo-400 rounded-lg text-xs">
                              <Plus className="w-3 h-3" /> В вакансию
                            </button>
                          )}
                        </div>

                        {/* Active applications badge */}
                        {candApps.length > 0 && (
                          <div className="mt-2 text-xs text-slate-400">
                            📋 {candApps.length} заявок: {candApps.map(a => getJobTitle(a.job_id)).join(', ')}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <button onClick={() => { setEditingCandidate(c); setShowCandidateForm(true); }}
                          className="p-1.5 hover:bg-slate-700 rounded-lg"><Edit2 className="w-3.5 h-3.5 text-slate-400" /></button>
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
          PIPELINE TAB
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'pipeline' && (
        <div className="p-4 space-y-4">
          {/* Filters */}
          <div className="space-y-2">
            <select
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500"
              value={pipelineJobId ?? ''}
              onChange={e => setPipelineJobId(e.target.value || null)}
            >
              <option value="">Все вакансии ({applications.length})</option>
              {jobs.map(j => (
                <option key={j.id} value={j.id}>
                  {j.title} ({applications.filter(a => a.job_id === j.id).length})
                </option>
              ))}
            </select>

            <div className="flex gap-2 overflow-x-auto scrollbar-hide py-1">
              <button
                onClick={() => setPipelineStageFilter(null)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${!pipelineStageFilter ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300'}`}
              >
                Все ({pipelineApps.length})
              </button>
              {HR_APP_STAGES.map(s => {
                const cnt = applications.filter(a =>
                  a.stage === s.value &&
                  (!pipelineJobId || a.job_id === pipelineJobId)
                ).length;
                if (cnt === 0) return null;
                return (
                  <button key={s.value}
                    onClick={() => setPipelineStageFilter(pipelineStageFilter === s.value ? null : s.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                      pipelineStageFilter === s.value ? `${s.color} text-white` : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {s.label} ({cnt})
                  </button>
                );
              })}
            </div>
          </div>

          {pipelineApps.length === 0 ? (
            <div className="text-center py-12">
              <Target className="w-12 h-12 mx-auto mb-2 text-slate-600" />
              <p className="text-slate-400">Нет заявок</p>
              <p className="text-xs text-slate-500 mt-1">Добавьте кандидатов в вакансию через раздел "Кандидаты"</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pipelineApps.map(app => {
                const candidate = candidates.find(c => c.id === app.candidate_id);
                const job = jobs.find(j => j.id === app.job_id);
                const stageConf = HR_APP_STAGES.find(s => s.value === app.stage);
                const appInterviews = interviews.filter(i => i.application_id === app.id);
                return (
                  <div key={app.id} className="bg-slate-800/80 rounded-2xl border border-slate-700/50 p-4">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-3 h-12 rounded-full flex-shrink-0 ${stageConf?.color ?? 'bg-blue-500'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium">{candidate?.name ?? '—'}</p>
                        <p className="text-xs text-slate-400">{job?.title ?? '—'}</p>

                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${stageConf?.color ?? ''} bg-opacity-30 text-white`}>
                            {stageConf?.label ?? app.stage}
                          </span>
                          {app.days_in_stage > 0 && (
                            <span className={`text-xs ${app.days_in_stage > 7 ? 'text-red-400' : 'text-slate-400'}`}>
                              {app.days_in_stage}д на стадии
                            </span>
                          )}
                          {app.score && (
                            <span className="text-xs text-amber-400">{'★'.repeat(app.score)}</span>
                          )}
                          {/* AI Score badge (Talantix-style) */}
                          {app.ai_score !== null && app.ai_score !== undefined && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              app.ai_verdict === 'strong_match' ? 'bg-green-500/20 text-green-400' :
                              app.ai_verdict === 'good_match' ? 'bg-emerald-500/20 text-emerald-400' :
                              app.ai_verdict === 'partial_match' ? 'bg-amber-500/20 text-amber-400' :
                              app.ai_verdict === 'weak_match' ? 'bg-orange-500/20 text-orange-400' :
                              'bg-red-500/20 text-red-400'
                            }`}>
                              🤖 {app.ai_score}%
                            </span>
                          )}
                        </div>

                        {candidate && (
                          <div className="flex items-center gap-2 mt-2">
                            {candidate.phone && (
                              <a href={`tel:${candidate.phone}`} className="p-1.5 bg-green-600/20 text-green-400 rounded-lg">
                                <Phone className="w-3 h-3" />
                              </a>
                            )}
                            {candidate.email && (
                              <a href={`mailto:${candidate.email}`} className="p-1.5 bg-blue-600/20 text-blue-400 rounded-lg">
                                <Mail className="w-3 h-3" />
                              </a>
                            )}
                            {appInterviews.length > 0 && (
                              <span className="text-xs text-slate-400">{appInterviews.length} интервью</span>
                            )}
                          </div>
                        )}

                        {/* Move stage buttons */}
                        {!['hired','rejected'].includes(app.stage) && (
                          <div className="flex gap-1.5 mt-3 overflow-x-auto scrollbar-hide">
                            <button onClick={() => { setMovingApp(app); setMoveStage(''); }}
                              className="px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 rounded-lg text-xs whitespace-nowrap transition-colors">
                              ▶ Переместить
                            </button>
                            <button onClick={() => handleComputeAIScore(app.id)}
                              className="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 rounded-lg text-xs whitespace-nowrap transition-colors flex items-center gap-1">
                              <Bot className="w-3 h-3" /> AI оценка
                            </button>
                            {app.stage !== 'offer' && (
                              <button onClick={() => { setOfferApp(app); }}
                                className="px-3 py-1.5 bg-amber-600/30 hover:bg-amber-600 text-amber-300 rounded-lg text-xs whitespace-nowrap transition-colors">
                                🎁 Оффер
                              </button>
                            )}
                          </div>
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
          INTERVIEWS TAB
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'interviews' && (
        <div className="p-4 space-y-4">
          {todayInterviews.length > 0 && (
            <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-xl">
              <p className="text-cyan-400 text-sm font-medium">📅 Сегодня {todayInterviews.length} интервью</p>
            </div>
          )}
          {interviews.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 mx-auto mb-2 text-slate-600" />
              <p className="text-slate-400">Интервью не запланированы</p>
            </div>
          ) : (
            <div className="space-y-3">
              {[...interviews].sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()).map(interview => {
                const candidate = candidates.find(c => c.id === interview.candidate_id);
                const job = jobs.find(j => j.id === interview.job_id);
                const d = new Date(interview.scheduled_at);
                const isToday = d.toDateString() === new Date().toDateString();
                const typeLabels: Record<string, string> = {
                  hr_call: 'Звонок HR', tech_screen: 'Тех. интервью',
                  hiring_manager: 'С менеджером', final: 'Финальное',
                  test_task: 'Тест. задание', bar_raiser: 'Bar Raiser',
                };
                return (
                  <div key={interview.id} className={`bg-slate-800/80 rounded-2xl border p-4 ${
                    isToday && interview.status === 'scheduled' ? 'border-cyan-500/30' : 'border-slate-700/50'
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-xl flex-shrink-0 ${isToday ? 'bg-cyan-500/20' : 'bg-slate-700'}`}>
                        <Calendar className={`w-4 h-4 ${isToday ? 'text-cyan-400' : 'text-slate-400'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium">{candidate?.name ?? '—'}</p>
                        <p className="text-xs text-slate-400">{job?.title ?? '—'}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-indigo-400">{typeLabels[interview.interview_type] ?? interview.interview_type}</span>
                          <span className="text-xs text-slate-400">
                            {d.toLocaleDateString('ru-RU')} {d.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' })}
                          </span>
                          {interview.location && <span className="text-xs text-slate-400">{interview.location}</span>}
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            interview.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                            interview.status === 'scheduled' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {interview.status === 'completed' ? 'Завершено' : interview.status === 'scheduled' ? 'Запланировано' : 'Отменено'}
                          </span>
                        </div>
                        {interview.status === 'completed' && interview.recommendation && (
                          <p className={`text-sm mt-1 ${RECOMMENDATION_COLORS[interview.recommendation] ?? 'text-slate-400'}`}>
                            {RECOMMENDATION_LABELS[interview.recommendation] ?? interview.recommendation}
                          </p>
                        )}
                        {interview.meeting_link && (
                          <a href={interview.meeting_link} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 mt-2 text-xs text-blue-400 hover:text-blue-300">
                            <ExternalLink className="w-3 h-3" /> Встреча
                          </a>
                        )}
                        {interview.status === 'scheduled' && (
                          <button
                            onClick={() => {
                              setScorecardInterview(interview);
                              setScorecard(HR_COMPETENCIES.slice(0, 5).map(c => ({ competency: c, score: 3, comment: '' })));
                              setInterviewFeedback('');
                              setInterviewRec('');
                            }}
                            className="mt-2 flex items-center gap-1 px-3 py-1.5 bg-amber-600/20 text-amber-400 rounded-lg text-xs"
                          >
                            <Award className="w-3 h-3" /> Заполнить оценку
                          </button>
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
          OFFERS TAB
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'offers' && (
        <div className="p-4 space-y-4">
          {offers.length === 0 ? (
            <div className="text-center py-12">
              <Gift className="w-12 h-12 mx-auto mb-2 text-slate-600" />
              <p className="text-slate-400">Офферов нет</p>
              <p className="text-xs text-slate-500 mt-1">Создайте оффер через раздел "Воронка"</p>
            </div>
          ) : (
            <div className="space-y-3">
              {offers.map(offer => {
                const candidate = candidates.find(c => c.id === offer.candidate_id);
                const job = jobs.find(j => j.id === offer.job_id);
                return (
                  <div key={offer.id} className={`bg-slate-800/80 rounded-2xl border p-4 ${
                    offer.status === 'accepted' ? 'border-green-500/30' :
                    offer.status === 'declined' ? 'border-red-500/30 opacity-70' :
                    offer.status === 'sent' ? 'border-amber-500/30' :
                    'border-slate-700/50'
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-xl flex-shrink-0 ${
                        offer.status === 'accepted' ? 'bg-green-500/20' :
                        offer.status === 'declined' ? 'bg-red-500/20' :
                        'bg-amber-500/20'
                      }`}>
                        <Gift className={`w-4 h-4 ${
                          offer.status === 'accepted' ? 'text-green-400' :
                          offer.status === 'declined' ? 'text-red-400' :
                          'text-amber-400'
                        }`} />
                      </div>
                      <div className="flex-1">
                        <p className="text-white font-medium">{candidate?.name ?? '—'}</p>
                        <p className="text-xs text-slate-400">{job?.title ?? '—'}</p>
                        <p className="text-green-400 font-bold mt-1">{offer.offered_salary.toLocaleString()} ₽</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-slate-400">
                          {offer.start_date && <span>Выход: {new Date(offer.start_date).toLocaleDateString('ru-RU')}</span>}
                          {offer.probation_months && <span>Испытание: {offer.probation_months} мес.</span>}
                          {offer.deadline && <span>Принять до: {new Date(offer.deadline).toLocaleDateString('ru-RU')}</span>}
                        </div>
                        {offer.bonuses && <p className="text-xs text-slate-400 mt-1">{offer.bonuses}</p>}

                        <div className="flex items-center gap-2 mt-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            offer.status === 'accepted' ? 'bg-green-500/20 text-green-400' :
                            offer.status === 'declined' ? 'bg-red-500/20 text-red-400' :
                            offer.status === 'sent' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-slate-700 text-slate-400'
                          }`}>
                            {offer.status === 'draft' ? 'Черновик' : offer.status === 'sent' ? 'Отправлен' :
                             offer.status === 'accepted' ? '✓ Принят' : offer.status === 'declined' ? '✗ Отклонён' : offer.status}
                          </span>

                          {offer.status === 'draft' && (
                            <button onClick={() => handleOfferStatusChange(offer.id, 'sent')}
                              className="px-2 py-1 bg-amber-600/30 text-amber-400 rounded-lg text-xs">
                              📤 Отправить
                            </button>
                          )}
                          {offer.status === 'sent' && (
                            <>
                              <button onClick={() => handleOfferStatusChange(offer.id, 'accepted')}
                                className="px-2 py-1 bg-green-600/30 text-green-400 rounded-lg text-xs">
                                ✓ Принят
                              </button>
                              <button onClick={() => handleOfferStatusChange(offer.id, 'declined')}
                                className="px-2 py-1 bg-red-600/20 text-red-400 rounded-lg text-xs">
                                ✗ Отклонён
                              </button>
                            </>
                          )}
                        </div>
                        {offer.decline_reason && (
                          <p className="text-xs text-red-400/70 mt-1">Причина: {offer.decline_reason}</p>
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

      {/* Job Form */}
      {showJobForm && (
        <CRMHRJobForm
          initial={editingJob ?? undefined}
          onClose={() => { setShowJobForm(false); setEditingJob(null); }}
          onSaved={saved => {
            setJobs(prev => editingJob ? prev.map(j => j.id === saved.id ? saved : j) : [saved, ...prev]);
            setShowJobForm(false); setEditingJob(null);
          }}
        />
      )}

      {/* Candidate Form */}
      {showCandidateForm && (
        <CRMHRCandidateForm
          initial={editingCandidate ?? undefined}
          onClose={() => { setShowCandidateForm(false); setEditingCandidate(null); }}
          onSaved={saved => {
            setCandidates(prev => editingCandidate ? prev.map(c => c.id === saved.id ? saved : c) : [saved, ...prev]);
            setShowCandidateForm(false); setEditingCandidate(null);
          }}
        />
      )}

      {/* Move stage modal */}
      {movingApp && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMovingApp(null)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold">Переместить кандидата</h3>
              <button onClick={() => setMovingApp(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <p className="text-sm text-slate-400">{getCandidateName(movingApp.candidate_id)} → {getJobTitle(movingApp.job_id)}</p>

            <div className="grid grid-cols-2 gap-2">
              {HR_APP_STAGES.filter(s => s.value !== movingApp.stage).map(s => (
                <button key={s.value}
                  onClick={() => setMoveStage(s.value)}
                  className={`py-2 px-3 rounded-xl text-sm text-left transition-colors ${
                    moveStage === s.value ? `${s.color} text-white` : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {moveStage === 'rejected' && (
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Причина отказа</label>
                <select
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white focus:outline-none"
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                >
                  <option value="">— выберите причину —</option>
                  {HR_REJECT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}

            {!['rejected','archived'].includes(moveStage) && moveStage && (
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Оценка (1-5)</label>
                <div className="flex gap-2">
                  {[1,2,3,4,5].map(n => (
                    <button key={n}
                      onClick={() => setMoveScore(String(n))}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
                        moveScore === String(n) ? 'bg-amber-500 text-white' : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {'★'.repeat(n)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Комментарий</label>
              <textarea
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none text-sm resize-none"
                rows={2}
                placeholder="Заметки рекрутера..."
                value={moveNotes}
                onChange={e => setMoveNotes(e.target.value)}
              />
            </div>

            <button onClick={handleMoveApp}
              disabled={!moveStage}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-medium">
              Переместить
            </button>
          </div>
        </div>
      )}

      {/* Offer modal */}
      {offerApp && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOfferApp(null)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold">🎁 Создать оффер</h3>
              <button onClick={() => setOfferApp(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <p className="text-sm text-slate-400">{getCandidateName(offerApp.candidate_id)}</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">ЗП оффера (₽) *</label>
                <input type="number"
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-amber-500"
                  placeholder="200 000"
                  value={offerSalary}
                  onChange={e => setOfferSalary(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Испытание (мес)</label>
                <input type="number"
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white focus:outline-none"
                  value={offerProbation}
                  onChange={e => setOfferProbation(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Дата выхода</label>
              <input type="date"
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white focus:outline-none"
                value={offerStartDate}
                onChange={e => setOfferStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Бонусы и условия</label>
              <textarea
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none text-sm resize-none"
                rows={2}
                placeholder="ДМС, обучение, корпоративный телефон..."
                value={offerBonuses}
                onChange={e => setOfferBonuses(e.target.value)}
              />
            </div>
            <button onClick={handleCreateOffer}
              className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium">
              Создать оффер
            </button>
          </div>
        </div>
      )}

      {/* Add to vacancy modal */}
      {addToPipelineCandidate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setAddToPipelineCandidate(null)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold">Добавить в вакансию</h3>
              <button onClick={() => setAddToPipelineCandidate(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <p className="text-sm text-slate-400">{addToPipelineCandidate.name}</p>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Вакансия</label>
              <select
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white focus:outline-none"
                value={addToJobId}
                onChange={e => setAddToJobId(e.target.value)}
              >
                <option value="">— выберите вакансию —</option>
                {jobs.filter(j => j.status === 'open').map(j => (
                  <option key={j.id} value={j.id}>{j.title} {j.grade ? `(${j.grade})` : ''}</option>
                ))}
              </select>
            </div>
            <button onClick={handleAddToVacancy}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium">
              Добавить в воронку
            </button>
          </div>
        </div>
      )}

      {/* Scorecard modal */}
      {scorecardInterview && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setScorecardInterview(null)} />
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-900/95 backdrop-blur-sm p-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" /> Оценка интервью
              </h3>
              <button onClick={() => setScorecardInterview(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-4 space-y-4">
              {/* Scorecard items */}
              {scorecard.map((item, idx) => (
                <div key={item.competency} className="bg-slate-800 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-white">{item.competency}</span>
                    <div className="flex gap-1">
                      {[1,2,3,4,5].map(n => (
                        <button key={n}
                          onClick={() => setScorecard(prev => prev.map((s, i) => i === idx ? { ...s, score: n } : s))}
                          className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors ${
                            item.score >= n ? 'bg-amber-500 text-white' : 'bg-slate-700 text-slate-400'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    className="w-full bg-slate-700 rounded-lg px-2 py-1.5 text-white text-xs placeholder-slate-500 focus:outline-none"
                    placeholder="Комментарий..."
                    value={item.comment}
                    onChange={e => setScorecard(prev => prev.map((s, i) => i === idx ? { ...s, comment: e.target.value } : s))}
                  />
                </div>
              ))}

              {/* Overall recommendation */}
              <div>
                <label className="text-xs text-slate-400 mb-2 block">Рекомендация</label>
                <div className="flex gap-2 flex-wrap">
                  {(['strong_yes','yes','hold','no','strong_no'] as const).map(r => (
                    <button key={r} onClick={() => setInterviewRec(r)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        interviewRec === r ? `${RECOMMENDATION_COLORS[r]} bg-white/10` : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {RECOMMENDATION_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Общий отзыв</label>
                <textarea
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none text-sm resize-none"
                  rows={3}
                  placeholder="Впечатление от кандидата, сильные/слабые стороны..."
                  value={interviewFeedback}
                  onChange={e => setInterviewFeedback(e.target.value)}
                />
              </div>

              <button onClick={handleCompleteScorecard}
                className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium">
                Сохранить оценку
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          ONBOARDING TAB (Skillaz)
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'onboarding' && (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" /> Онбординг сотрудников
            </h2>
            <span className="text-xs text-slate-400">{onboardings.length} активных</span>
          </div>

          {onboardings.length === 0 && applications.filter(a => a.stage === 'hired').length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Нет активных онбордингов</p>
              <p className="text-xs mt-1">Онбординг создаётся при найме кандидата</p>
            </div>
          )}

          {onboardings.map(ob => {
            const cand = candidates.find(c => c.id === ob.candidate_id);
            const job = jobs.find(j => j.id === ob.job_id);
            const total = ob.tasks.length;
            const doneCount = ob.tasks.filter(t => t.completed).length;
            const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
            const CATEGORY_COLORS: Record<string, string> = {
              docs: 'bg-blue-500/20 text-blue-400', access: 'bg-purple-500/20 text-purple-400',
              intro: 'bg-green-500/20 text-green-400', training: 'bg-amber-500/20 text-amber-400',
              equipment: 'bg-slate-500/20 text-slate-400', evaluation: 'bg-red-500/20 text-red-400',
              culture: 'bg-pink-500/20 text-pink-400',
            };
            return (
              <div key={ob.id} className="bg-slate-800/80 rounded-2xl border border-slate-700/50 overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-white font-medium">{cand?.name ?? '—'}</p>
                      <p className="text-xs text-slate-400">{job?.title ?? '—'} · Выход: {ob.start_date}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      ob.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                      ob.status === 'in_progress' ? 'bg-indigo-500/20 text-indigo-400' :
                      ob.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                      'bg-slate-500/20 text-slate-400'
                    }`}>{ob.status}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-slate-400 w-10 text-right">{doneCount}/{total}</span>
                  </div>
                  <div className="space-y-2">
                    {ob.tasks.map(task => (
                      <div key={task.id} className="flex items-center gap-3">
                        <button
                          onClick={() => handleToggleOnboardingTask(ob.id, task.id, !task.completed)}
                          className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                            task.completed ? 'bg-green-500 border-green-500' : 'border-slate-600 hover:border-indigo-400'
                          }`}
                        >
                          {task.completed && <CheckCircle className="w-3 h-3 text-white" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${task.completed ? 'line-through text-slate-500' : 'text-slate-200'}`}>{task.title}</p>
                          <p className="text-xs text-slate-500">День {task.day_offset}</p>
                        </div>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${CATEGORY_COLORS[task.category] ?? 'bg-slate-700 text-slate-400'}`}>
                          {task.category}
                        </span>
                        {task.required && <span className="text-xs text-red-400">*</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          {applications.filter(a => a.stage === 'hired' && !onboardings.find(o => o.candidate_id === a.candidate_id)).length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
              <p className="text-amber-400 text-sm font-medium mb-2">⚠ Нанятые без онбординга</p>
              {applications.filter(a => a.stage === 'hired' && !onboardings.find(o => o.candidate_id === a.candidate_id)).map(a => (
                <div key={a.id} className="flex items-center justify-between py-1">
                  <span className="text-sm text-slate-300">{getCandidateName(a.candidate_id)}</span>
                  <button
                    onClick={() => handleCreateOnboarding(a.candidate_id, a.job_id)}
                    className="text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
                  >
                    Создать онбординг
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          DOCUMENTS TAB (HRlink КЭДО)
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'documents' && (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-green-400" /> КЭДО — Кадровые документы
            </h2>
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {['all', 'pending', 'sent', 'signed', 'rejected'].map(s => (
              <button key={s}
                onClick={() => setDocsFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors ${
                  docsFilter === s ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                {s === 'all' ? 'Все' : s === 'pending' ? '⏳ Ожидает' : s === 'sent' ? '📤 Отправлен' : s === 'signed' ? '✅ Подписан' : '❌ Отклонён'}
              </button>
            ))}
          </div>
          <select
            className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
            value={docsCandidate}
            onChange={e => setDocsCandidate(e.target.value)}
          >
            <option value="all">Все кандидаты</option>
            {candidates.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {employmentDocs
            .filter(d => (docsFilter === 'all' || d.status === docsFilter) && (docsCandidate === 'all' || d.candidate_id === docsCandidate))
            .map(doc => {
              const cand = candidates.find(c => c.id === doc.candidate_id);
              const STATUS_COLORS: Record<string, string> = {
                pending: 'text-amber-400 bg-amber-400/10', sent: 'text-blue-400 bg-blue-400/10',
                signed: 'text-green-400 bg-green-400/10', rejected: 'text-red-400 bg-red-400/10',
                expired: 'text-slate-400 bg-slate-400/10',
              };
              const SEND_LABELS: Record<string, string> = {
                email: '📧 Email', gosuslugi: '🏛 Госуслуги', hrlink: '🔗 HRlink', manual: '📝 Вручную',
              };
              return (
                <div key={doc.id} className="bg-slate-800/80 rounded-2xl border border-slate-700/50 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-white font-medium text-sm">{doc.title}</p>
                      <p className="text-xs text-slate-400">{cand?.name ?? '—'} · {doc.doc_type.replace(/_/g, ' ')}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[doc.status] ?? ''}`}>{doc.status}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>{SEND_LABELS[doc.send_method] ?? doc.send_method}</span>
                    {doc.sent_at && <span>Отправлен: {new Date(doc.sent_at).toLocaleDateString('ru')}</span>}
                    {doc.signed_at && <span>Подписан: {new Date(doc.signed_at).toLocaleDateString('ru')}</span>}
                  </div>
                  {doc.status === 'pending' && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleUpsertDoc(doc.candidate_id!, doc.doc_type, doc.title, 'sent', doc.send_method)}
                        className="flex-1 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded-lg text-xs flex items-center justify-center gap-1"
                      >
                        <Send className="w-3 h-3" /> Отправить
                      </button>
                      <button
                        onClick={() => handleUpsertDoc(doc.candidate_id!, doc.doc_type, doc.title, 'signed', doc.send_method)}
                        className="flex-1 py-1.5 bg-green-600/20 hover:bg-green-600/40 text-green-400 rounded-lg text-xs flex items-center justify-center gap-1"
                      >
                        <FileCheck className="w-3 h-3" /> Подписан
                      </button>
                    </div>
                  )}
                  {doc.status === 'sent' && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleUpsertDoc(doc.candidate_id!, doc.doc_type, doc.title, 'signed', doc.send_method)}
                        className="flex-1 py-1.5 bg-green-600/20 hover:bg-green-600/40 text-green-400 rounded-lg text-xs flex items-center justify-center gap-1"
                      >
                        <FileCheck className="w-3 h-3" /> Подписан
                      </button>
                      <button
                        onClick={() => handleUpsertDoc(doc.candidate_id!, doc.doc_type, doc.title, 'rejected', doc.send_method)}
                        className="flex-1 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg text-xs flex items-center justify-center gap-1"
                      >
                        <X className="w-3 h-3" /> Отклонён
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

          {employmentDocs.filter(d => (docsFilter === 'all' || d.status === docsFilter) && (docsCandidate === 'all' || d.candidate_id === docsCandidate)).length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Нет документов</p>
            </div>
          )}

          {docsCandidate !== 'all' && (
            <div className="bg-slate-800/60 rounded-2xl border border-slate-700/50 p-4 space-y-3">
              <p className="text-sm text-slate-300 font-medium">Добавить документ</p>
              {EMPLOYMENT_DOC_TYPES.map(dt => {
                const exists = employmentDocs.find(d => d.candidate_id === docsCandidate && d.doc_type === dt.value);
                return (
                  <div key={dt.value} className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">{dt.label}</span>
                    {exists ? (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        exists.status === 'signed' ? 'bg-green-500/20 text-green-400' :
                        exists.status === 'sent' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-amber-500/20 text-amber-400'
                      }`}>{exists.status}</span>
                    ) : (
                      <button
                        onClick={() => handleUpsertDoc(docsCandidate, dt.value as HREmploymentDoc['doc_type'], dt.label, 'pending', 'email')}
                        className="text-xs px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg"
                      >
                        + Создать
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TEMPLATES TAB (Talantix auto-reply)
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'templates' && (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-purple-400" /> Шаблоны сообщений
            </h2>
            <div className="flex gap-2">
              <button onClick={handleSeedTemplates}
                className="text-xs px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg">
                Стандартные
              </button>
              <button
                onClick={() => { setEditingTemplate({} as HRTemplate); setTplName(''); setTplCategory('invitation'); setTplSubject(''); setTplBody(''); }}
                className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Новый
              </button>
            </div>
          </div>

          {editingTemplate !== null && (
            <div className="bg-slate-800/80 rounded-2xl border border-indigo-500/30 p-4 space-y-3">
              <p className="text-white font-medium text-sm">{editingTemplate.id ? 'Редактировать' : 'Новый шаблон'}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Название</label>
                  <input
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                    value={tplName} onChange={e => setTplName(e.target.value)} placeholder="Название"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Категория</label>
                  <select
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
                    value={tplCategory} onChange={e => setTplCategory(e.target.value)}
                  >
                    <option value="invitation">Приглашение</option>
                    <option value="rejection">Отказ</option>
                    <option value="offer">Оффер</option>
                    <option value="auto_reply">Авто-ответ</option>
                    <option value="follow_up">Follow-up</option>
                    <option value="onboarding">Онбординг</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Тема письма</label>
                <input
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                  value={tplSubject} onChange={e => setTplSubject(e.target.value)} placeholder="Тема (опционально)"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Текст</label>
                <textarea
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none"
                  rows={5} value={tplBody} onChange={e => setTplBody(e.target.value)}
                  placeholder="Используйте: {{candidate_name}}, {{job_title}}, {{company_name}}, {{interview_date}}, {{recruiter_name}}"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {['{{candidate_name}}', '{{job_title}}', '{{company_name}}', '{{interview_date}}', '{{recruiter_name}}', '{{offer_salary}}'].map(v => (
                  <button key={v}
                    onClick={() => setTplBody(prev => prev + v)}
                    className="text-xs px-2 py-1 bg-indigo-500/20 text-indigo-400 rounded hover:bg-indigo-500/30"
                  >
                    {v}
                  </button>
                ))}
              </div>
              {tplBody && tplPreviewCandidate && (
                <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-600">
                  <p className="text-xs text-slate-400 mb-1">Предпросмотр:</p>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">
                    {crm.renderTemplate(tplBody, {
                      candidate_name: candidates.find(c => c.id === tplPreviewCandidate)?.name ?? 'Иван Иванов',
                      job_title: jobs[0]?.title ?? 'Frontend Developer',
                      company_name: 'Компания',
                      recruiter_name: 'Рекрутер',
                    })}
                  </p>
                </div>
              )}
              <div className="flex gap-2">
                <select
                  className="flex-1 bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-slate-400 text-sm focus:outline-none"
                  value={tplPreviewCandidate} onChange={e => setTplPreviewCandidate(e.target.value)}
                >
                  <option value="">Предпросмотр для...</option>
                  {candidates.slice(0, 10).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button onClick={() => setEditingTemplate(null)} className="px-4 py-2 bg-slate-700 text-slate-300 rounded-xl text-sm">Отмена</button>
                <button onClick={handleSaveTemplate} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm">Сохранить</button>
              </div>
            </div>
          )}

          {['invitation', 'rejection', 'offer', 'auto_reply', 'follow_up', 'onboarding'].map(cat => {
            const catTemplates = templates.filter(t => t.category === cat);
            if (catTemplates.length === 0) return null;
            const CAT_LABELS: Record<string, string> = {
              invitation: '📅 Приглашения', rejection: '❌ Отказы', offer: '🎁 Офферы',
              auto_reply: '🤖 Авто-ответы', follow_up: '🔔 Follow-up', onboarding: '🚀 Онбординг',
            };
            return (
              <div key={cat}>
                <p className="text-xs text-slate-400 font-medium mb-2">{CAT_LABELS[cat]}</p>
                <div className="space-y-2">
                  {catTemplates.map(tpl => (
                    <div key={tpl.id} className="bg-slate-800/80 rounded-xl border border-slate-700/50 p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium">{tpl.name}</p>
                          {tpl.subject && <p className="text-xs text-slate-400">Тема: {tpl.subject}</p>}
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{tpl.body}</p>
                        </div>
                        <button
                          onClick={() => {
                            setEditingTemplate(tpl);
                            setTplName(tpl.name); setTplCategory(tpl.category);
                            setTplSubject(tpl.subject ?? ''); setTplBody(tpl.body);
                          }}
                          className="ml-2 p-1.5 hover:bg-slate-700 rounded-lg"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {templates.length === 0 && editingTemplate === null && (
            <div className="text-center py-12 text-slate-500">
              <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Нет шаблонов</p>
              <button onClick={handleSeedTemplates} className="mt-3 text-sm text-indigo-400 hover:text-indigo-300">
                Загрузить стандартные →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          BRAND TAB (Dream Job)
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'brand' && (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold flex items-center gap-2">
              <Building2 className="w-5 h-5 text-amber-400" /> Бренд работодателя
            </h2>
            <button
              onClick={() => {
                setEditingBrand(true);
                setBrandEnps(String(employerBrand?.enps_score ?? ''));
                setBrandRating(String(employerBrand?.dreamjob_rating ?? ''));
                setBrandEvp(employerBrand?.evp_items.map(e => e.title).join('\n') ?? '');
                setBrandAwards(employerBrand?.awards.join('\n') ?? '');
              }}
              className="text-xs px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg flex items-center gap-1"
            >
              <Edit2 className="w-3 h-3" /> Редактировать
            </button>
          </div>

          <div className="bg-slate-800/80 rounded-2xl border border-slate-700/50 p-5">
            <p className="text-xs text-slate-400 mb-1">eNPS (Employee Net Promoter Score)</p>
            <div className="flex items-end gap-3">
              <p className={`text-4xl font-bold ${
                (employerBrand?.enps_score ?? 0) >= 50 ? 'text-green-400' :
                (employerBrand?.enps_score ?? 0) >= 0 ? 'text-amber-400' : 'text-red-400'
              }`}>
                {employerBrand?.enps_score !== null && employerBrand?.enps_score !== undefined
                  ? (employerBrand.enps_score > 0 ? '+' : '') + employerBrand.enps_score
                  : '—'}
              </p>
              <div className="flex-1 mb-1">
                <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      (employerBrand?.enps_score ?? 0) >= 50 ? 'bg-green-500' :
                      (employerBrand?.enps_score ?? 0) >= 0 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, ((employerBrand?.enps_score ?? 0) + 100) / 2))}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-500 mt-0.5">
                  <span>-100</span><span>0</span><span>+100</span>
                </div>
              </div>
            </div>
            {employerBrand?.enps_respondents ? (
              <p className="text-xs text-slate-500 mt-1">{employerBrand.enps_respondents} респондентов · {employerBrand.enps_period ?? ''}</p>
            ) : null}
          </div>

          <div className="bg-slate-800/80 rounded-2xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-400 mb-2">Dream Job рейтинг</p>
            <div className="flex items-center gap-3">
              <div className="flex gap-0.5">
                {[1,2,3,4,5].map(s => (
                  <Star key={s} className={`w-6 h-6 ${
                    s <= Math.round(employerBrand?.dreamjob_rating ?? 0) ? 'text-amber-400 fill-amber-400' : 'text-slate-600'
                  }`} />
                ))}
              </div>
              <span className="text-2xl font-bold text-white">{employerBrand?.dreamjob_rating?.toFixed(1) ?? '—'}</span>
              {employerBrand?.dreamjob_reviews ? (
                <span className="text-xs text-slate-400">{employerBrand.dreamjob_reviews} отзывов</span>
              ) : null}
            </div>
            {employerBrand?.positive_reviews_pct !== null && employerBrand?.positive_reviews_pct !== undefined && (
              <p className="text-xs text-green-400 mt-1">👍 {employerBrand.positive_reviews_pct}% положительных</p>
            )}
          </div>

          {employerBrand?.evp_items && employerBrand.evp_items.length > 0 && (
            <div className="bg-slate-800/80 rounded-2xl border border-slate-700/50 p-4">
              <p className="text-xs text-slate-400 mb-3">EVP — Ценностное предложение работодателя</p>
              <div className="space-y-2">
                {employerBrand.evp_items.map((item, i) => {
                  const CAT_ICONS: Record<string, string> = {
                    comp: '💰', culture: '🎭', growth: '📈', work_life: '⚖️', mission: '🎯', perks: '🎁',
                  };
                  return (
                    <div key={i} className={`flex items-center gap-2 p-2 rounded-lg ${item.highlight ? 'bg-indigo-500/10 border border-indigo-500/30' : 'bg-slate-700/30'}`}>
                      <span>{CAT_ICONS[item.category] ?? '•'}</span>
                      <span className="text-sm text-slate-300">{item.title}</span>
                      {item.highlight && <span className="ml-auto text-xs text-indigo-400">★ Ключевое</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {employerBrand?.awards && employerBrand.awards.length > 0 && (
            <div className="bg-slate-800/80 rounded-2xl border border-slate-700/50 p-4">
              <p className="text-xs text-slate-400 mb-3">🏆 Награды и сертификаты</p>
              <div className="flex flex-wrap gap-2">
                {employerBrand.awards.map((award, i) => (
                  <span key={i} className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-full text-sm">
                    🏅 {award}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!employerBrand && (
            <div className="text-center py-12 text-slate-500">
              <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Данные бренда не заполнены</p>
              <button onClick={() => setEditingBrand(true)} className="mt-3 text-sm text-indigo-400 hover:text-indigo-300">
                Заполнить данные →
              </button>
            </div>
          )}

          {editingBrand && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditingBrand(false)} />
              <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl p-5 space-y-4 max-h-[80vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-semibold">Бренд работодателя</h3>
                  <button onClick={() => setEditingBrand(false)}><X className="w-5 h-5 text-slate-400" /></button>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">eNPS (-100 до +100)</label>
                  <input type="number" min="-100" max="100"
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white focus:outline-none"
                    value={brandEnps} onChange={e => setBrandEnps(e.target.value)} placeholder="-100 ... +100"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Dream Job рейтинг (1.0-5.0)</label>
                  <input type="number" min="1" max="5" step="0.1"
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white focus:outline-none"
                    value={brandRating} onChange={e => setBrandRating(e.target.value)} placeholder="4.2"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">EVP пункты (каждый с новой строки)</label>
                  <textarea
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white focus:outline-none resize-none"
                    rows={4} value={brandEvp} onChange={e => setBrandEvp(e.target.value)}
                    placeholder="Конкурентная зарплата&#10;Гибкий график&#10;Обучение за счёт компании"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Награды (каждая с новой строки)</label>
                  <textarea
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white focus:outline-none resize-none"
                    rows={3} value={brandAwards} onChange={e => setBrandAwards(e.target.value)}
                    placeholder="Лучший работодатель 2024&#10;Top-100 IT компаний"
                  />
                </div>
                <button onClick={handleSaveBrand}
                  className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium">
                  Сохранить
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CRMHRDashboard;
