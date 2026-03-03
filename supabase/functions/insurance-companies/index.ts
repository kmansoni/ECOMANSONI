// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const fallbackCompanies = [
  { id: "ingos", name: "Ингосстрах", rating: 4.8, reviewsCount: 12453, founded: 1947, license: "СИ-0660", categories: ["osago","kasko","dms","travel","property","mortgage","life"], description: "Один из крупнейших страховщиков России.", logoUrl: null, isPopular: true, hasMobileApp: true, hasOnlineService: true, avgClaimDays: 7, claimApprovalRate: 94, premiumStart: 3200 },
  { id: "sogaz", name: "СОГАЗ", rating: 4.7, reviewsCount: 9871, founded: 1993, license: "СИ-0631", categories: ["osago","kasko","dms","property","mortgage","life"], description: "Крупнейший корпоративный страховщик.", logoUrl: null, isPopular: true, hasMobileApp: true, hasOnlineService: true, avgClaimDays: 8, claimApprovalRate: 92, premiumStart: 3500 },
  { id: "alfa", name: "АльфаСтрахование", rating: 4.6, reviewsCount: 8234, founded: 1992, license: "СИ-2239", categories: ["osago","kasko","dms","travel","property","life"], description: "Универсальная страховая компания.", logoUrl: null, isPopular: true, hasMobileApp: true, hasOnlineService: true, avgClaimDays: 9, claimApprovalRate: 91, premiumStart: 2900 },
  { id: "ren", name: "Ренессанс Страхование", rating: 4.5, reviewsCount: 6712, founded: 1997, license: "СИ-1284", categories: ["osago","kasko","dms","travel","property"], description: "Технологичная компания с быстрым урегулированием.", logoUrl: null, isPopular: false, hasMobileApp: true, hasOnlineService: true, avgClaimDays: 6, claimApprovalRate: 93, premiumStart: 2800 },
  { id: "rosgos", name: "РОСГОССТРАХ", rating: 4.3, reviewsCount: 15234, founded: 1921, license: "СИ-0977", categories: ["osago","kasko","dms","property","life"], description: "Старейшая страховая компания России.", logoUrl: null, isPopular: true, hasMobileApp: true, hasOnlineService: true, avgClaimDays: 12, claimApprovalRate: 88, premiumStart: 2600 },
  { id: "vsk", name: "ВСК", rating: 4.4, reviewsCount: 5431, founded: 1992, license: "СИ-0621", categories: ["osago","kasko","travel","property","life"], description: "Надёжный страховщик с широкой сетью.", logoUrl: null, isPopular: false, hasMobileApp: false, hasOnlineService: true, avgClaimDays: 10, claimApprovalRate: 90, premiumStart: 3100 },
  { id: "sber", name: "СберСтрахование", rating: 4.5, reviewsCount: 7823, founded: 2003, license: "СИ-4387", categories: ["osago","dms","property","mortgage","life"], description: "Страховой сервис экосистемы Сбера.", logoUrl: null, isPopular: true, hasMobileApp: true, hasOnlineService: true, avgClaimDays: 8, claimApprovalRate: 91, premiumStart: 3300 },
  { id: "tinkoff", name: "Тинькофф Страхование", rating: 4.6, reviewsCount: 9234, founded: 2013, license: "СИ-4741", categories: ["osago","kasko","travel","property"], description: "Полностью цифровой страховщик.", logoUrl: null, isPopular: true, hasMobileApp: true, hasOnlineService: true, avgClaimDays: 5, claimApprovalRate: 92, premiumStart: 2700 },
  { id: "absolut", name: "Абсолют Страхование", rating: 4.2, reviewsCount: 2134, founded: 1993, license: "СИ-1776", categories: ["osago","kasko","property","mortgage"], description: "Региональный страховщик с доступными тарифами.", logoUrl: null, isPopular: false, hasMobileApp: false, hasOnlineService: true, avgClaimDays: 14, claimApprovalRate: 85, premiumStart: 2400 },
  { id: "mafin", name: "Mafin", rating: 4.4, reviewsCount: 1876, founded: 2019, license: "СИ-5012", categories: ["osago","kasko"], description: "Онлайн-страхование автомобилей.", logoUrl: null, isPopular: false, hasMobileApp: true, hasOnlineService: true, avgClaimDays: 6, claimApprovalRate: 91, premiumStart: 2500 },
  { id: "gelios", name: "Гелиос", rating: 4.1, reviewsCount: 1234, founded: 1996, license: "СИ-0879", categories: ["osago","travel","property"], description: "Специализация на туристическом страховании.", logoUrl: null, isPopular: false, hasMobileApp: false, hasOnlineService: true, avgClaimDays: 11, claimApprovalRate: 87, premiumStart: 2200 },
  { id: "ergo", name: "Эрго", rating: 4.3, reviewsCount: 3421, founded: 1991, license: "СИ-1011", categories: ["osago","kasko","dms","travel","life"], description: "Дочерняя компания международной группы ERGO.", logoUrl: null, isPopular: false, hasMobileApp: true, hasOnlineService: true, avgClaimDays: 9, claimApprovalRate: 89, premiumStart: 2900 },
];

type CompanyOutput = {
  id: string;
  name: string;
  rating: number;
  reviewsCount: number;
  founded: number;
  license: string;
  categories: string[];
  description: string;
  logoUrl: string | null;
  isPopular: boolean;
  hasMobileApp: boolean;
  hasOnlineService: boolean;
  avgClaimDays: number;
  claimApprovalRate: number;
  premiumStart: number;
};

function mapDbRowToCompany(row: Record<string, unknown>): CompanyOutput {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    rating: Number(row.rating ?? 0),
    reviewsCount: Number(row.reviews_count ?? 0),
    founded: Number(row.founded_year ?? 0),
    license: String(row.license_number ?? ""),
    categories: Array.isArray(row.categories) ? row.categories.map(String) : [],
    description: String(row.description ?? ""),
    logoUrl: row.logo_url ? String(row.logo_url) : null,
    isPopular: Boolean(row.is_partner ?? false),
    hasMobileApp: Boolean(row.api_available ?? false),
    hasOnlineService: true,
    avgClaimDays: Number(row.avg_claim_days ?? 0),
    claimApprovalRate: Number(row.claim_approval_rate ?? 0),
    premiumStart: Number((row as { premium_start?: number }).premium_start ?? 0),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const category = url.searchParams.get("category");
    const ratingMin = parseFloat(url.searchParams.get("rating_min") ?? "0");
    const sortBy = url.searchParams.get("sort_by") ?? "rating";

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    let companies: CompanyOutput[] = [...fallbackCompanies];

    if (supabaseUrl && supabaseServiceRoleKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
      const { data, error } = await supabase
        .from("insurance_companies")
        .select("id,name,rating,reviews_count,founded_year,license_number,categories,description,logo_url,is_partner,api_available,avg_claim_days,claim_approval_rate,premium_start")
        .order("rating", { ascending: false });

      if (!error && data && data.length > 0) {
        companies = data.map((row) => mapDbRowToCompany(row as Record<string, unknown>));
      }
    }

    if (category) {
      companies = companies.filter((c) => c.categories.includes(category));
    }
    if (ratingMin > 0) {
      companies = companies.filter((c) => c.rating >= ratingMin);
    }

    if (sortBy === "rating") {
      companies.sort((a, b) => b.rating - a.rating);
    } else if (sortBy === "reviews") {
      companies.sort((a, b) => b.reviewsCount - a.reviewsCount);
    } else if (sortBy === "price") {
      companies.sort((a, b) => a.premiumStart - b.premiumStart);
    } else if (sortBy === "claims") {
      companies.sort((a, b) => b.claimApprovalRate - a.claimApprovalRate);
    }

    return new Response(
      JSON.stringify({ companies, total: companies.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: { code: "SERVER_ERROR", message: (error as Error).message } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
