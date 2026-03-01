import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  Users, 
  Briefcase, 
  CheckCircle, 
  Clock, 
  TrendingUp,
  Plus,
  UserPlus,
  DollarSign,
  Calendar,
  MoreVertical,
  Phone,
  Mail,
  MessageSquare
} from "lucide-react";
import { crm, type DashboardStats, type PipelineStage, type Profession } from "@/lib/crm";

// Profession display names
const professionNames: Record<string, string> = {
  default: 'Универсальная CRM',
  auto: 'Авто бизнес',
  realestate: 'Недвижимость',
  hr: 'HR / Рекрутинг',
  smm: 'SMM / Маркетинг',
  finance: 'Финансы / Бухгалтерия',
  medicine: 'Медицина',
  education: 'Образование',
  beauty: 'Салоны красоты',
  restaurant: 'Ресторан / Общепит',
  tourism: 'Туризм',
  retail: 'Розничная торговля',
  logistics: 'Логистика',
  hotel: 'Отель / Хостел',
  entertainment: 'Ивент / Развлечения',
  fitness: 'Фитнес / Спорт',
  construction: 'Строительство',
  insurance: 'Страхование',
  health: 'Здоровье',
  design: 'Дизайн / Творчество',
  agriculture: 'Сельское хозяйство',
};

const stageNames: Record<string, string> = {
  new: 'Новые',
  contacted: 'Первичный контакт',
  qualified: 'Квалификация',
  proposal: 'Коммерческое предложение',
  negotiation: 'Переговоры',
  won: 'Выиграно',
  lost: 'Проиграно',
  // Auto
  test_drive: 'Тест-драйв',
  credit_approval: 'Одобрение кредита',
  deal: 'Сделка',
  completed: 'Завершено',
  // Real estate
  viewing: 'Просмотр',
  contract: 'Договор',
  // HR
  screening: 'Скрининг',
  interview: 'Интервью',
  offer: 'Оффер',
  hired: 'Нанят',
  rejected: 'Отказ',
};

interface QuickAction {
  id: string;
  icon: React.ElementType;
  label: string;
  action: () => void;
}

export function CRMDashboard() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const profession = (searchParams.get('profession') || 'default') as Profession;
  
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [pipeline, setPipeline] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'clients' | 'deals' | 'tasks'>('dashboard');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      crm.setProfession(profession);
      const [statsData, pipelineData] = await Promise.all([
        crm.getDashboardStats(),
        crm.getPipeline(),
      ]);
      setStats(statsData);
      setPipeline(pipelineData);
    } catch (error) {
      console.error('Failed to load CRM data:', error);
    } finally {
      setLoading(false);
    }
  }, [profession]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleAddClient = () => {
    // TODO: Open add client modal
    console.log('Add client');
  };

  const handleAddDeal = () => {
    // TODO: Open add deal modal
    console.log('Add deal');
  };

  const handleAddTask = () => {
    // TODO: Open add task modal
    console.log('Add task');
  };

  const quickActions: QuickAction[] = [
    { id: 'add-client', icon: UserPlus, label: 'Клиент', action: handleAddClient },
    { id: 'add-deal', icon: DollarSign, label: 'Сделка', action: handleAddDeal },
    { id: 'add-task', icon: CheckCircle, label: 'Задача', action: handleAddTask },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700">
        <div className="flex items-center gap-4 p-4">
          <button 
            onClick={() => navigate('/crm')}
            className="p-2 rounded-full hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">{professionNames[profession] || 'CRM'}</h1>
            <p className="text-sm text-slate-400">Дашборд</p>
          </div>
          <button className="p-2 rounded-full hover:bg-slate-700 transition-colors">
            <MoreVertical className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-4 gap-1 overflow-x-auto">
          {[
            { id: 'dashboard', label: 'Дашборд' },
            { id: 'clients', label: 'Клиенты' },
            { id: 'deals', label: 'Сделки' },
            { id: 'tasks', label: 'Задачи' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dashboard Content */}
      {activeTab === 'dashboard' && (
        <div className="p-4 space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Users className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats?.total_clients || 0}</p>
                  <p className="text-xs text-slate-400">Клиентов</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <Briefcase className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats?.active_deals || 0}</p>
                  <p className="text-xs text-slate-400">Активных сделок</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats?.won_deals || 0}</p>
                  <p className="text-xs text-slate-400">Выиграно</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <Clock className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats?.pending_tasks || 0}</p>
                  <p className="text-xs text-slate-400">Задач</p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">Быстрые действия</h2>
            <div className="flex gap-3">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    onClick={action.action}
                    className="flex-1 flex flex-col items-center gap-2 p-4 bg-slate-800/80 rounded-2xl border border-slate-700/50 hover:bg-slate-700 transition-colors"
                  >
                    <div className="p-3 bg-blue-500/20 rounded-full">
                      <Icon className="w-5 h-5 text-blue-400" />
                    </div>
                    <span className="text-sm text-slate-200">{action.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pipeline */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">Воронка продаж</h2>
            <div className="space-y-2">
              {pipeline.map((stage) => (
                <div 
                  key={stage.stage}
                  className="flex items-center justify-between p-3 bg-slate-800/80 rounded-xl border border-slate-700/50"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      stage.stage === 'won' ? 'bg-green-500' :
                      stage.stage === 'lost' ? 'bg-red-500' :
                      'bg-blue-500'
                    }`} />
                    <span className="text-slate-200">{stageNames[stage.stage] || stage.stage}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-white font-medium">{stage.count}</span>
                    {stage.total_value > 0 && (
                      <span className="text-slate-400 text-sm ml-2">
                        {stage.total_value.toLocaleString()} ₽
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {pipeline.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  <Briefcase className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Нет активных сделок</p>
                </div>
              )}
            </div>
          </div>

          {/* Overdue Tasks Warning */}
          {stats && stats.overdue_tasks > 0 && (
            <div className="p-4 bg-red-500/10 rounded-2xl border border-red-500/30">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-red-400" />
                <div>
                  <p className="text-red-400 font-medium">Просроченные задачи</p>
                  <p className="text-sm text-red-400/70">{stats.overdue_tasks} задач требуют внимания</p>
                </div>
              </div>
            </div>
          )}

          {/* Total Revenue */}
          {stats && stats.total_deals_value > 0 && (
            <div className="p-4 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-2xl border border-green-500/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-400/70">Общая сумма выигранных сделок</p>
                  <p className="text-2xl font-bold text-green-400">
                    {stats.total_deals_value.toLocaleString()} ₽
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-green-400/50" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Clients Tab */}
      {activeTab === 'clients' && (
        <div className="p-4">
          <button
            onClick={handleAddClient}
            className="w-full flex items-center justify-center gap-2 p-4 bg-blue-600 hover:bg-blue-700 rounded-2xl text-white font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            Добавить клиента
          </button>
          
          <div className="mt-4 text-center py-12 text-slate-400">
            <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Список клиентов пуст</p>
            <p className="text-sm">Добавьте первого клиента</p>
          </div>
        </div>
      )}

      {/* Deals Tab */}
      {activeTab === 'deals' && (
        <div className="p-4">
          <button
            onClick={handleAddDeal}
            className="w-full flex items-center justify-center gap-2 p-4 bg-blue-600 hover:bg-blue-700 rounded-2xl text-white font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            Добавить сделку
          </button>
          
          <div className="mt-4 text-center py-12 text-slate-400">
            <Briefcase className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Список сделок пуст</p>
            <p className="text-sm">Добавьте первую сделку</p>
          </div>
        </div>
      )}

      {/* Tasks Tab */}
      {activeTab === 'tasks' && (
        <div className="p-4">
          <button
            onClick={handleAddTask}
            className="w-full flex items-center justify-center gap-2 p-4 bg-blue-600 hover:bg-blue-700 rounded-2xl text-white font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            Добавить задачу
          </button>
          
          <div className="mt-4 text-center py-12 text-slate-400">
            <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Список задач пуст</p>
            <p className="text-sm">Добавьте первую задачу</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default CRMDashboard;
