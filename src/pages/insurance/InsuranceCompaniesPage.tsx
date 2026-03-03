import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft, Search, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InsuranceCategoryTabs } from "@/components/insurance/shared/InsuranceCategoryTabs";
import { CompanyCard } from "@/components/insurance/shared/CompanyCard";
import type { InsuranceCategory, InsuranceCompanyFull } from "@/types/insurance";

const MOCK_COMPANIES: InsuranceCompanyFull[] = [
  {
    id: "1", slug: "ingosstrakh", name: "Ингосстрах", logo_url: "", description: "Один из крупнейших страховщиков России. Широкий спектр страховых продуктов для физических и юридических лиц.",
    rating: 4.5, reviews_count: 2400, license_number: "СИ №0928", license_date: "2001-05-12", founded_year: 1947,
    website: "https://ingos.ru", phone: "+7 (495) 956-55-55", email: "info@ingos.ru",
    categories: ["osago", "kasko", "dms", "travel", "property"] as InsuranceCategory[],
    features: ["Онлайн оформление", "Без очередей", "Электронный полис"], regions: ["Москва", "СПб"],
    avg_claim_days: 12, claim_approval_rate: 91, is_partner: true, api_available: true, created_at: "2020-01-01",
  },
  {
    id: "2", slug: "reso-garantia", name: "РЕСО-Гарантия", logo_url: "", description: "Ведущая страховая группа с разветвлённой агентской сетью по всей России.",
    rating: 4.3, reviews_count: 1800, license_number: "СЛ №1209", license_date: "1999-08-20", founded_year: 1991,
    website: "https://reso.ru", phone: "+7 (495) 730-13-00", email: "info@reso.ru",
    categories: ["osago", "kasko", "dms", "life", "property"] as InsuranceCategory[],
    features: ["Широкая агентская сеть", "Гибкие тарифы"], regions: ["Москва", "Регионы"],
    avg_claim_days: 15, claim_approval_rate: 88, is_partner: true, api_available: true, created_at: "2020-01-01",
  },
  {
    id: "3", slug: "alfastrakhovaniye", name: "АльфаСтрахование", logo_url: "", description: "Крупнейшая частная страховая группа России. Инновационные решения и высокий сервис.",
    rating: 4.4, reviews_count: 2100, license_number: "СЛ №2239", license_date: "2003-03-15", founded_year: 1992,
    website: "https://alfastrah.ru", phone: "+7 (495) 788-0-888", email: "info@alfastrah.ru",
    categories: ["osago", "kasko", "dms", "travel", "property", "mortgage"] as InsuranceCategory[],
    features: ["Партнёр Альфа-Банка", "Скидки для зарплатников"], regions: ["Вся Россия"],
    avg_claim_days: 10, claim_approval_rate: 93, is_partner: false, api_available: true, created_at: "2020-01-01",
  },
  {
    id: "4", slug: "rosgosstrakh", name: "Росгосстрах", logo_url: "", description: "Крупнейшая страховая компания страны с историей более 100 лет. Максимальное покрытие.",
    rating: 4.1, reviews_count: 3200, license_number: "СЛ №0001", license_date: "1992-01-01", founded_year: 1921,
    website: "https://rgs.ru", phone: "+7 (800) 200-99-77", email: "rgs@rgs.ru",
    categories: ["osago", "kasko", "dms", "life", "property", "mortgage"] as InsuranceCategory[],
    features: ["Самая широкая сеть офисов", "100 лет на рынке"], regions: ["Вся Россия"],
    avg_claim_days: 18, claim_approval_rate: 85, is_partner: false, api_available: false, created_at: "2020-01-01",
  },
  {
    id: "5", slug: "vsk", name: "ВСК", logo_url: "", description: "Военно-страховая компания. Надёжный партнёр с высокими финансовыми показателями.",
    rating: 4.0, reviews_count: 1500, license_number: "СЛ №0621", license_date: "1994-06-10", founded_year: 1992,
    website: "https://vsk.ru", phone: "+7 (800) 775-15-75", email: "info@vsk.ru",
    categories: ["osago", "kasko", "dms", "property"] as InsuranceCategory[],
    features: ["ДМС для военных", "Гос. гарантии"], regions: ["Вся Россия"],
    avg_claim_days: 14, claim_approval_rate: 87, is_partner: false, api_available: true, created_at: "2020-01-01",
  },
  {
    id: "6", slug: "sogaz", name: "СОГАЗ", logo_url: "", description: "Страховая группа «Газпрома». Лидер корпоративного страхования с наивысшими рейтингами надёжности.",
    rating: 4.6, reviews_count: 900, license_number: "СЛ №1208", license_date: "1993-07-14", founded_year: 1993,
    website: "https://sogaz.ru", phone: "+7 (495) 221-66-55", email: "info@sogaz.ru",
    categories: ["osago", "kasko", "dms", "life", "property", "mortgage"] as InsuranceCategory[],
    features: ["Рейтинг ruAAA", "Корпоративный страховщик"], regions: ["Вся Россия"],
    avg_claim_days: 9, claim_approval_rate: 96, is_partner: true, api_available: true, created_at: "2020-01-01",
  },
  {
    id: "7", slug: "renessans", name: "Ренессанс Страхование", logo_url: "", description: "Современная страховая компания с удобным цифровым сервисом и быстрыми выплатами.",
    rating: 4.2, reviews_count: 1100, license_number: "СЛ №1284", license_date: "1997-10-08", founded_year: 1997,
    website: "https://renins.ru", phone: "+7 (495) 981-43-05", email: "info@renins.ru",
    categories: ["osago", "kasko", "dms", "travel"] as InsuranceCategory[],
    features: ["Удобное приложение", "Быстрые выплаты"], regions: ["Крупные города"],
    avg_claim_days: 11, claim_approval_rate: 90, is_partner: false, api_available: true, created_at: "2020-01-01",
  },
  {
    id: "8", slug: "tinkoff", name: "Тинькофф Страхование", logo_url: "", description: "Полностью цифровая страховая компания. Оформление за 5 минут без визита в офис.",
    rating: 4.7, reviews_count: 2800, license_number: "СЛ №4184", license_date: "2014-03-25", founded_year: 2014,
    website: "https://tinkoff.ru/insurance", phone: "+7 (888) 888-88-88", email: "insurance@tinkoff.ru",
    categories: ["osago", "kasko", "dms", "travel", "property", "life"] as InsuranceCategory[],
    features: ["Только онлайн", "Кэшбэк баллами Тинькофф"], regions: ["Вся Россия"],
    avg_claim_days: 7, claim_approval_rate: 96, is_partner: true, api_available: true, created_at: "2020-01-01",
  },
  {
    id: "9", slug: "sberstrakh", name: "СберСтрахование", logo_url: "", description: "Страховая компания Сбербанка. Удобная интеграция с экосистемой Сбера.",
    rating: 4.3, reviews_count: 2000, license_number: "СЛ №3692", license_date: "2011-11-01", founded_year: 2011,
    website: "https://sber.ru/insurance", phone: "+7 (900) 555-55-55", email: "insurance@sber.ru",
    categories: ["osago", "kasko", "dms", "property", "mortgage", "life"] as InsuranceCategory[],
    features: ["Клиентам Сбера скидка 10%", "СберОнлайн"], regions: ["Вся Россия"],
    avg_claim_days: 12, claim_approval_rate: 90, is_partner: true, api_available: true, created_at: "2020-01-01",
  },
  {
    id: "10", slug: "yugoriya", name: "Югория", logo_url: "", description: "Региональный страховщик с Урала. Хорошие условия по ОСАГО и имуществу.",
    rating: 3.9, reviews_count: 600, license_number: "СЛ №0918", license_date: "2000-04-17", founded_year: 1997,
    website: "https://ugsk.ru", phone: "+7 (800) 100-43-43", email: "ugsk@ugsk.ru",
    categories: ["osago", "kasko", "property"] as InsuranceCategory[],
    features: ["Хорошие тарифы по ОСАГО"], regions: ["Урал", "Сибирь"],
    avg_claim_days: 20, claim_approval_rate: 82, is_partner: false, api_available: false, created_at: "2020-01-01",
  },
  {
    id: "11", slug: "maks", name: "МАКС", logo_url: "", description: "Московская акционерная страховая компания. Специализируется на ОСАГО и корпоративном страховании.",
    rating: 3.8, reviews_count: 500, license_number: "СЛ №0781", license_date: "1999-09-01", founded_year: 1992,
    website: "https://maks-ins.ru", phone: "+7 (495) 105-01-01", email: "info@maks-ins.ru",
    categories: ["osago", "kasko", "property", "dms"] as InsuranceCategory[],
    features: ["Доступные тарифы ОСАГО"], regions: ["Москва", "ЦФО"],
    avg_claim_days: 17, claim_approval_rate: 83, is_partner: false, api_available: false, created_at: "2020-01-01",
  },
  {
    id: "12", slug: "zetta", name: "Зетта Страхование", logo_url: "", description: "Универсальный страховщик с фокусом на автостраховании.",
    rating: 4.0, reviews_count: 400, license_number: "СЛ №2209", license_date: "2004-06-30", founded_year: 2004,
    website: "https://zettains.ru", phone: "+7 (495) 660-77-00", email: "info@zettains.ru",
    categories: ["osago", "kasko", "property"] as InsuranceCategory[],
    features: ["Выгодное КАСКО", "Скидки за безаварийность"], regions: ["Вся Россия"],
    avg_claim_days: 16, claim_approval_rate: 85, is_partner: false, api_available: true, created_at: "2020-01-01",
  },
];

type SortOption = "rating" | "alpha" | "reviews";

export default function InsuranceCompaniesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<InsuranceCategory | "all">("all");
  const [sort, setSort] = useState<SortOption>("rating");

  const filtered = useMemo(() => {
    let list = [...MOCK_COMPANIES];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    if (category !== "all") {
      list = list.filter((c) => c.categories.includes(category as InsuranceCategory));
    }
    if (sort === "rating") list.sort((a, b) => b.rating - a.rating);
    else if (sort === "alpha") list.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    else if (sort === "reviews") list.sort((a, b) => b.reviews_count - a.reviews_count);
    return list;
  }, [search, category, sort]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-white/[0.06]">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <p className="text-xs text-white/40">Страхование → Компании</p>
            <h1 className="text-base font-semibold text-white">Страховые компании России</h1>
          </div>
        </div>

        {/* Filters */}
        <div className="px-4 pb-3 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <Input
                placeholder="Поиск по названию..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30 h-9 text-sm"
              />
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
              <SelectTrigger className="w-40 bg-white/5 border-white/10 text-white h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-white/10 text-white">
                <SelectItem value="rating">По рейтингу</SelectItem>
                <SelectItem value="alpha">По алфавиту</SelectItem>
                <SelectItem value="reviews">По отзывам</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <InsuranceCategoryTabs selected={category} onChange={setCategory} showAll />
        </div>
      </div>

      <div className="px-4 pt-4">
        <p className="text-xs text-white/40 mb-3">Найдено: {filtered.length} компаний</p>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Building2 className="w-10 h-10 text-white/20 mb-3" />
            <p className="text-sm text-white/40">Компании не найдены</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((company, idx) => (
              <motion.div
                key={company.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
              >
                <CompanyCard
                  company={company}
                  onDetails={() => navigate(`/insurance/company/${company.slug}`)}
                  onProducts={() => navigate(`/insurance/company/${company.slug}`)}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
