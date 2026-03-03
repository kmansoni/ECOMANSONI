import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ChevronLeft, Star, Phone, Mail, Globe, MapPin,
  Shield, CheckCircle, XCircle, Clock, FileText,
  ThumbsUp, ThumbsDown, MessageSquare, Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { getCategoryLabel, formatRating, formatReviewsCount } from "@/lib/insurance/formatters";
import type { InsuranceCategory } from "@/types/insurance";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CompanyVerificationBadge } from "@/components/insurance/rating/CompanyVerificationBadge";
import { CompanyProfileLink } from "@/components/insurance/rating/CompanyProfileLink";
import { PolicyRatingSystem } from "@/components/insurance/rating/PolicyRatingSystem";
import { InsuranceStories } from "@/components/insurance/media/InsuranceStories";
import { InsuranceReelsBanner } from "@/components/insurance/media/InsuranceReelsBanner";

const MOCK_COMPANIES: Record<string, {
  id: string; slug: string; name: string; description: string;
  rating: number; reviews_count: number; license_number: string; founded_year: number;
  website: string; phone: string; email: string; address: string;
  categories: InsuranceCategory[]; avg_claim_days: number; claim_approval_rate: number;
  is_partner: boolean; products_count: number;
  pros: string[]; cons: string[];
}> = {
  "ingosstrakh": {
    id: "1", slug: "ingosstrakh", name: "Ингосстрах",
    description: "Один из крупнейших и наиболее надёжных страховщиков России. Компания основана в 1947 году и имеет богатую историю. Предлагает широкий спектр страховых продуктов как для физических, так и для юридических лиц.",
    rating: 4.5, reviews_count: 2400, license_number: "СИ №0928", founded_year: 1947,
    website: "https://ingos.ru", phone: "+7 (495) 956-55-55", email: "info@ingos.ru", address: "Москва, ул. Пятницкая, 12",
    categories: ["osago", "kasko", "dms", "travel", "property"] as InsuranceCategory[],
    avg_claim_days: 12, claim_approval_rate: 91, is_partner: true, products_count: 24,
    pros: ["Высокий рейтинг надёжности", "Широкая филиальная сеть", "Онлайн-сервисы", "Быстрая выплата страхового возмещения"],
    cons: ["Высокие тарифы по КАСКО", "Долгое ожидание в офисах", "Иногда сложная документация"],
  },
  "tinkoff": {
    id: "8", slug: "tinkoff", name: "Тинькофф Страхование",
    description: "Полностью цифровая страховая компания группы Тинькофф. Оформление полисов занимает 5 минут без визита в офис. Лидер по удовлетворённости клиентов по итогам 2024 года.",
    rating: 4.7, reviews_count: 2800, license_number: "СЛ №4184", founded_year: 2014,
    website: "https://tinkoff.ru/insurance", phone: "+7 (888) 888-88-88", email: "insurance@tinkoff.ru", address: "Москва, ул. 2-я Хуторская, 38А",
    categories: ["osago", "kasko", "dms", "travel", "property", "life"] as InsuranceCategory[],
    avg_claim_days: 7, claim_approval_rate: 96, is_partner: true, products_count: 18,
    pros: ["Полностью онлайн", "Быстрые выплаты (до 7 дней)", "Удобное приложение", "Кэшбэк баллами Тинькофф"],
    cons: ["Нет физических офисов", "Ограниченное покрытие в отдалённых регионах"],
  },
};

const MOCK_REVIEWS = [
  { id: "r1", author: "Андрей К.", rating: 5, date: "15 фев 2026", pros: "Быстро оформил ОСАГО, пришло за 2 минуты на почту. Цена приятная.", cons: "Иногда зависает сайт", helpful: 24 },
  { id: "r2", author: "Мария П.", rating: 4, date: "10 янв 2026", pros: "Страховой случай — помяли бампер. Выплатили за 10 дней без вопросов.", cons: "Пришлось собрать много документов", helpful: 18 },
  { id: "r3", author: "Дмитрий С.", rating: 3, date: "05 дек 2025", pros: "Нормально, полис получил.", cons: "Поддержка долго отвечает, ждал 40 минут", helpful: 7 },
];

const MOCK_PRODUCTS = [
  { id: "p1", name: "ОСАГО Онлайн", category: "osago" as InsuranceCategory, premium_from: 7800, coverage: 400000, features: ["Онлайн оформление", "Мгновенная выдача"] },
  { id: "p2", name: "КАСКО Стандарт", category: "kasko" as InsuranceCategory, premium_from: 45000, coverage: 1500000, features: ["Полный ущерб", "Угон", "Помощь на дороге"] },
  { id: "p3", name: "ДМС Базовый", category: "dms" as InsuranceCategory, premium_from: 18000, coverage: 1000000, features: ["Поликлиники", "Скорая помощь", "Госпитализация"] },
];

export default function InsuranceCompanyDetailPage() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const [reviewRating, setReviewRating] = useState(5);

  const company = slug ? MOCK_COMPANIES[slug] : null;

  if (!company) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center flex-col gap-4">
        <Shield className="w-12 h-12 text-white/20" />
        <p className="text-white/40">Компания не найдена</p>
        <Button onClick={() => navigate("/insurance/companies")} variant="outline">
          К каталогу
        </Button>
      </div>
    );
  }

  const handleSubmitReview = () => {
    toast.success("Отзыв отправлен на модерацию");
    setReviewOpen(false);
    setReviewText("");
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-white/[0.06]">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <p className="text-xs text-white/40">
              <Link to="/insurance/companies" className="hover:text-white/60">Компании</Link>
              {" → "}
              {company.name}
            </p>
          </div>
          {company.is_partner && (
            <Badge className="bg-violet-500/20 text-violet-400 gap-1 text-xs">
              <CheckCircle className="w-3 h-3" />
              Партнёр
            </Badge>
          )}
        </div>
      </div>

      <div className="px-4 pt-4">
        {/* Company hero */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-4 mb-6"
        >
          <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
            <Shield className="w-8 h-8 text-violet-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-xl font-bold text-white">{company.name}</h1>
              <CompanyVerificationBadge level={company.is_partner ? "partner" : "verified"} showLabel={false} />
            </div>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className={cn("w-4 h-4", s <= Math.round(company.rating) ? "text-yellow-400 fill-yellow-400" : "text-white/20")}
                  />
                ))}
              </div>
              <span className="text-sm font-semibold text-white">{formatRating(company.rating)}</span>
              <span className="text-xs text-white/40">{formatReviewsCount(company.reviews_count)}</span>
            </div>
            <p className="text-sm text-white/50 leading-relaxed">{company.description}</p>
          </div>
        </motion.div>

        {/* Key stats */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {[
            { label: "Выплат одобрено", value: `${company.claim_approval_rate}%`, color: "text-emerald-400" },
            { label: "Срок выплат", value: `${company.avg_claim_days} дн.`, color: "text-violet-400" },
            { label: "Продуктов", value: company.products_count.toString(), color: "text-blue-400" },
          ].map((stat) => (
            <Card key={stat.label} className="bg-white/[0.02] border-white/[0.06]">
              <CardContent className="p-3 text-center">
                <p className={cn("text-lg font-bold", stat.color)}>{stat.value}</p>
                <p className="text-xs text-white/40 mt-0.5">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Approval rate bar */}
        <Card className="bg-white/[0.02] border-white/[0.06] mb-6">
          <CardContent className="p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-white/60">Процент одобрения выплат</span>
              <span className="text-sm font-bold text-emerald-400">{company.claim_approval_rate}%</span>
            </div>
            <Progress value={company.claim_approval_rate} className="h-2" />
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="overview">
          <TabsList className="w-full bg-white/5 mb-4">
            <TabsTrigger value="overview" className="flex-1 text-xs data-[state=active]:bg-violet-600 data-[state=active]:text-white">Обзор</TabsTrigger>
            <TabsTrigger value="products" className="flex-1 text-xs data-[state=active]:bg-violet-600 data-[state=active]:text-white">Продукты</TabsTrigger>
            <TabsTrigger value="reviews" className="flex-1 text-xs data-[state=active]:bg-violet-600 data-[state=active]:text-white">Отзывы</TabsTrigger>
            <TabsTrigger value="contacts" className="flex-1 text-xs data-[state=active]:bg-violet-600 data-[state=active]:text-white">Контакты</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-4">
            <Card className="bg-white/[0.02] border-white/[0.06]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-white">Информация о компании</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {[
                  { label: "Год основания", value: company.founded_year },
                  { label: "Лицензия", value: company.license_number },
                  { label: "Категории", value: company.categories.map(getCategoryLabel).join(", ") },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between py-1.5 border-b border-white/[0.04]">
                    <span className="text-white/50">{row.label}</span>
                    <span className="text-white/80 text-right max-w-[60%]">{row.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card className="bg-emerald-500/5 border-emerald-500/20">
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-emerald-400 mb-2 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Преимущества
                  </p>
                  <ul className="space-y-1">
                    {company.pros.map((p, i) => (
                      <li key={i} className="text-xs text-white/60 flex items-start gap-1.5">
                        <CheckCircle className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card className="bg-red-500/5 border-red-500/20">
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-red-400 mb-2 flex items-center gap-1">
                    <XCircle className="w-3 h-3" />
                    Недостатки
                  </p>
                  <ul className="space-y-1">
                    {company.cons.map((c, i) => (
                      <li key={i} className="text-xs text-white/60 flex items-start gap-1.5">
                        <XCircle className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />
                        {c}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* PRODUCTS */}
          <TabsContent value="products" className="space-y-3">
            {MOCK_PRODUCTS.map((product, idx) => (
              <motion.div key={product.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.08 }}>
                <Card className="bg-white/[0.02] border-white/[0.06]">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-xs text-violet-400 mb-0.5">{getCategoryLabel(product.category)}</p>
                        <h3 className="text-sm font-semibold text-white">{product.name}</h3>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-white/40">от</p>
                        <p className="text-base font-bold text-white">
                          {new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(product.premium_from)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {product.features.map((f) => (
                        <span key={f} className="text-xs bg-white/5 text-white/50 px-2 py-0.5 rounded-full">{f}</span>
                      ))}
                    </div>
                    <Button size="sm" className="w-full bg-violet-600 hover:bg-violet-500 text-xs" onClick={() => navigate("/insurance")}>
                      Оформить
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </TabsContent>

          {/* REVIEWS */}
          <TabsContent value="reviews" className="space-y-3">
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm text-white/60">{formatReviewsCount(company.reviews_count)}</p>
              <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-violet-600 hover:bg-violet-500 text-xs">
                    <MessageSquare className="w-3 h-3 mr-1" />
                    Оставить отзыв
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-zinc-900 border-white/10 text-white max-w-sm mx-auto">
                  <DialogHeader>
                    <DialogTitle>Ваш отзыв о {company.name}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-white/50 mb-2">Оценка</p>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <button key={s} type="button" onClick={() => setReviewRating(s)}>
                            <Star className={cn("w-6 h-6", s <= reviewRating ? "text-yellow-400 fill-yellow-400" : "text-white/20")} />
                          </button>
                        ))}
                      </div>
                    </div>
                    <Textarea
                      placeholder="Расскажите о своём опыте..."
                      value={reviewText}
                      onChange={(e) => setReviewText(e.target.value)}
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 resize-none"
                      rows={4}
                    />
                    <Button className="w-full bg-violet-600 hover:bg-violet-500" onClick={handleSubmitReview}>
                      Отправить отзыв
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            {MOCK_REVIEWS.map((review) => (
              <Card key={review.id} className="bg-white/[0.02] border-white/[0.06]">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center">
                        <span className="text-xs text-violet-400 font-medium">{review.author[0]}</span>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-white">{review.author}</p>
                        <p className="text-xs text-white/30">{review.date}</p>
                      </div>
                    </div>
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className={cn("w-3 h-3", s <= review.rating ? "text-yellow-400 fill-yellow-400" : "text-white/20")} />
                      ))}
                    </div>
                  </div>
                  <Separator className="bg-white/[0.06] mb-3" />
                  <div className="space-y-1.5 mb-3">
                    <p className="text-xs text-emerald-400 font-medium">Плюсы: <span className="text-white/60 font-normal">{review.pros}</span></p>
                    <p className="text-xs text-red-400 font-medium">Минусы: <span className="text-white/60 font-normal">{review.cons}</span></p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-white/40">
                    <span>Полезно?</span>
                    <button type="button" className="flex items-center gap-1 hover:text-emerald-400">
                      <ThumbsUp className="w-3 h-3" /> {review.helpful}
                    </button>
                    <button type="button" className="flex items-center gap-1 hover:text-red-400">
                      <ThumbsDown className="w-3 h-3" /> 0
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* CONTACTS */}
          <TabsContent value="contacts" className="space-y-4">
            <Card className="bg-white/[0.02] border-white/[0.06]">
              <CardContent className="p-4 space-y-3">
                {[
                  { icon: Phone, label: "Телефон", value: company.phone },
                  { icon: Mail, label: "Email", value: company.email },
                  { icon: Globe, label: "Сайт", value: company.website },
                  { icon: MapPin, label: "Адрес", value: company.address },
                  { icon: FileText, label: "Лицензия", value: company.license_number },
                  { icon: Clock, label: "На рынке с", value: `${company.founded_year} года` },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-start gap-3 py-2 border-b border-white/[0.04] last:border-0">
                    <Icon className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-white/40">{label}</p>
                      <p className="text-sm text-white/80">{value}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <CompanyProfileLink
              companyId={company.slug}
              companyName={company.name}
              verificationLevel={company.is_partner ? "partner" : "verified"}
            />
          </TabsContent>
        </Tabs>

        {/* Stories section */}
        <section className="mt-6 space-y-3">
          <h2 className="text-base font-semibold text-white">Stories компании</h2>
          <InsuranceStories filterCompanyId={company.slug} />
        </section>

        {/* Reels section */}
        <section className="mt-6">
          <InsuranceReelsBanner filterCompanyId={company.slug} />
        </section>

        {/* Policy ratings */}
        <section className="mt-6 space-y-3">
          <h2 className="text-base font-semibold text-white">Оценки полисов</h2>
          <Card className="bg-white/[0.02] border-white/[0.06]">
            <CardContent className="p-4">
              <PolicyRatingSystem companyName={company.name} mode="submit" />
            </CardContent>
          </Card>
        </section>

        {/* Subscribe button */}
        <div className="mt-6">
          <Button
            className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/80"
            onClick={() => toast.success(`Вы подписались на обновления ${company.name}`)}
          >
            <Bell className="w-4 h-4 mr-2" />
            Подписаться на обновления
          </Button>
        </div>
      </div>
    </div>
  );
}
