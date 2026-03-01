import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  Briefcase, 
  Car, 
  Home, 
  Stethoscope, 
  GraduationCap, 
  Store, 
  Truck, 
  Plane, 
  Hotel, 
  Music, 
  Dumbbell, 
  Scissors, 
  Utensils, 
  Building2, 
  TrendingUp,
  Users,
  Palette,
  Calculator,
  Heart,
  Shield,
  Leaf
} from "lucide-react";

// Profession categories with icons
const professions = [
  { id: "auto", name: "Авто бизнес", icon: Car, color: "bg-blue-500" },
  { id: "realestate", name: "Недвижимость", icon: Home, color: "bg-green-500" },
  { id: "hr", name: "HR / Рекрутинг", icon: Users, color: "bg-purple-500" },
  { id: "smm", name: "SMM / Маркетинг", icon: TrendingUp, color: "bg-pink-500" },
  { id: "finance", name: "Финансы / Бухгалтерия", icon: Calculator, color: "bg-yellow-500" },
  { id: "medicine", name: "Медицина", icon: Stethoscope, color: "bg-red-500" },
  { id: "education", name: "Образование", icon: GraduationCap, color: "bg-indigo-500" },
  { id: "beauty", name: "Салоны красоты", icon: Scissors, color: "bg-pink-400" },
  { id: "restaurant", name: "Ресторан / Общепит", icon: Utensils, color: "bg-orange-500" },
  { id: "tourism", name: "Туризм", icon: Plane, color: "bg-cyan-500" },
  { id: "retail", name: "Розничная торговля", icon: Store, color: "bg-emerald-500" },
  { id: "logistics", name: "Логистика / Грузоперевозки", icon: Truck, color: "bg-amber-600" },
  { id: "hotel", name: "Отель / Хостел", icon: Hotel, color: "bg-teal-500" },
  { id: "entertainment", name: "Ивент / Развлечения", icon: Music, color: "bg-violet-500" },
  { id: "fitness", name: "Фитнес / Спорт", icon: Dumbbell, color: "bg-lime-500" },
  { id: "construction", name: "Строительство", icon: Building2, color: "bg-stone-500" },
  { id: "insurance", name: "Страхование", icon: Shield, color: "bg-slate-600" },
  { id: "health", name: "Здоровье / Wellness", icon: Heart, color: "bg-rose-500" },
  { id: "design", name: "Дизайн / Творчество", icon: Palette, color: "bg-fuchsia-500" },
  { id: "agriculture", name: "Сельское хозяйство", icon: Leaf, color: "bg-green-600" },
  { id: "default", name: "Универсальная CRM", icon: Briefcase, color: "bg-gray-500" },
];

export function CRMPage() {
  const navigate = useNavigate();
  const [selectedProfession, setSelectedProfession] = useState<string | null>(null);

  const handleProfessionSelect = (professionId: string) => {
    setSelectedProfession(professionId);
    // Navigate to the CRM dashboard with the selected profession
    navigate(`/crm/dashboard?profession=${professionId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700">
        <div className="flex items-center gap-4 p-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="text-xl font-bold text-white">Выберите профессию</h1>
        </div>
      </div>

      {/* Profession Grid */}
      <div className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {professions.map((profession) => {
            const Icon = profession.icon;
            return (
              <button
                key={profession.id}
                onClick={() => handleProfessionSelect(profession.id)}
                className="flex flex-col items-center justify-center p-6 rounded-2xl bg-slate-800/80 hover:bg-slate-700 transition-all duration-300 hover:scale-105 hover:shadow-lg border border-slate-700/50 hover:border-slate-600"
              >
                <div className={`p-4 rounded-full ${profession.color} mb-3 shadow-lg`}>
                  <Icon className="w-8 h-8 text-white" />
                </div>
                <span className="text-sm font-medium text-center text-slate-200">
                  {profession.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Info Section */}
      <div className="p-4 mt-4">
        <div className="p-6 rounded-2xl bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30">
          <h2 className="text-lg font-semibold text-white mb-2">CRM для вашего бизнеса</h2>
          <p className="text-slate-300 text-sm">
            Выберите сферу деятельности, чтобы получить оптимизированный набор функций. 
            Каждая CRM адаптирована под специфику вашего бизнеса: клиенты, сделки, задачи и аналитика.
          </p>
        </div>
      </div>
    </div>
  );
}

export default CRMPage;
