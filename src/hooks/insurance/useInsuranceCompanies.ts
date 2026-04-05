import { useQuery } from "@tanstack/react-query";
import { insuranceApi } from "@/lib/insurance/api";
import type { InsuranceFilters } from "@/types/insurance";

/**
 * Хук для получения списка страховых компаний
 */
export function useInsuranceCompanies(filters?: InsuranceFilters) {
  return useQuery({
    queryKey: ["insurance-companies-full", filters],
    queryFn: () => insuranceApi.getCompanies(filters),
  });
}

/**
 * Хук для получения данных конкретной страховой компании
 */
export function useInsuranceCompany(id: string | undefined) {
  return useQuery({
    queryKey: ["insurance-company", id],
    queryFn: () => insuranceApi.getCompany(id!),
    enabled: !!id,
  });
}

export function useInsuranceCompanyBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: ["insurance-company-slug", slug],
    queryFn: () => insuranceApi.getCompanyBySlug(slug!),
    enabled: !!slug,
  });
}

/**
 * Хук для получения отзывов о страховой компании
 */
export function useCompanyReviews(companyId: string | undefined) {
  return useQuery({
    queryKey: ["insurance-company-reviews", companyId],
    queryFn: () => insuranceApi.getReviews(companyId!),
    enabled: !!companyId,
  });
}
