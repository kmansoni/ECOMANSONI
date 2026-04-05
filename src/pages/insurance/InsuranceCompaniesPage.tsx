import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft, Search, Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InsuranceCategoryTabs } from "@/components/insurance/shared/InsuranceCategoryTabs";
import { CompanyCard } from "@/components/insurance/shared/CompanyCard";
import { useInsuranceCompanies } from "@/hooks/insurance/useInsuranceCompanies";
import type { InsuranceCategory } from "@/types/insurance";

type SortOption = "rating" | "alpha" | "reviews";

export default function InsuranceCompaniesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<InsuranceCategory | "all">("all");
  const [sort, setSort] = useState<SortOption>("rating");
  const { data: companies = [], isLoading } = useInsuranceCompanies();

  const filtered = useMemo(() => {
    let list = [...companies];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    if (category !== "all") {
      list = list.filter((c) => c.categories?.includes(category as InsuranceCategory));
    }
    if (sort === "rating") list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    else if (sort === "alpha") list.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    else if (sort === "reviews") list.sort((a, b) => (b.reviews_count ?? 0) - (a.reviews_count ?? 0));
    return list;
  }, [companies, search, category, sort]);

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

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
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
