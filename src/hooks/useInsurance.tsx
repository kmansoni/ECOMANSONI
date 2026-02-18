import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface InsuranceCompany {
  id: string;
  name: string;
  logo_url: string | null;
  rating: number | null;
  is_verified: boolean | null;
  commission_rate: number | null;
  priority: number | null;
  supported_products: string[] | null;
  description: string | null;
  website: string | null;
  phone: string | null;
}

export interface InsuranceProduct {
  id: string;
  company_id: string;
  name: string;
  category: string;
  description: string | null;
  price_from: number;
  coverage_amount: number | null;
  features: string[] | null;
  is_popular: boolean | null;
  badge: string | null;
  min_term_days: number | null;
  max_term_days: number | null;
  calculation_params: Record<string, unknown> | null;
  is_active: boolean | null;
  company?: InsuranceCompany;
}

export function useInsuranceCompanies() {
  return useQuery({
    queryKey: ["insurance-companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("insurance_companies")
        .select("*")
        .order("priority", { ascending: false });
      
      if (error) throw error;
      return data as InsuranceCompany[];
    },
  });
}

type InsuranceCategory = "auto" | "dms" | "health" | "kasko" | "life" | "mini_kasko" | "mortgage" | "osago" | "osgop" | "property" | "travel";

export function useInsuranceProducts(category?: string) {
  return useQuery({
    queryKey: ["insurance-products", category],
    queryFn: async () => {
      let query = supabase
        .from("insurance_products")
        .select(`
          *,
          company:insurance_companies(*)
        `)
        .eq("is_active", true)
        .order("is_popular", { ascending: false })
        .order("price_from", { ascending: true });
      
      if (category && category !== "all") {
        query = query.eq("category", category as InsuranceCategory);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as InsuranceProduct[];
    },
  });
}

export function usePopularProducts() {
  return useQuery({
    queryKey: ["insurance-products-popular"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("insurance_products")
        .select(`
          *,
          company:insurance_companies(*)
        `)
        .eq("is_popular", true)
        .eq("is_active", true)
        .order("price_from", { ascending: true })
        .limit(10);
      
      if (error) throw error;
      return data as InsuranceProduct[];
    },
  });
}

export function useProductsByCategory() {
  return useQuery({
    queryKey: ["insurance-products-by-category"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("insurance_products")
        .select(`
          *,
          company:insurance_companies(*)
        `)
        .eq("is_active", true)
        .order("price_from", { ascending: true });
      
      if (error) throw error;
      
      // Group by category
      const grouped: Record<string, InsuranceProduct[]> = {};
      (data as InsuranceProduct[]).forEach((product) => {
        if (!grouped[product.category]) {
          grouped[product.category] = [];
        }
        grouped[product.category].push(product);
      });
      
      return grouped;
    },
  });
}

// Category labels
export const categoryLabels: Record<string, string> = {
  osago: "ОСАГО",
  kasko: "КАСКО",
  mini_kasko: "Мини-КАСКО",
  mortgage: "Ипотека",
  property: "Имущество",
  dms: "ДМС",
  travel: "Путешествия",
  life: "Жизнь",
  health: "Здоровье",
  auto: "Авто",
  osgop: "ОСГОП",
};

export const categoryIcons: Record<string, string> = {
  osago: "🚗",
  kasko: "🛡️",
  mini_kasko: "🚙",
  mortgage: "🏠",
  property: "🏢",
  dms: "🏥",
  travel: "✈️",
  life: "❤️",
  health: "💊",
  auto: "🚘",
  osgop: "🚌",
};
