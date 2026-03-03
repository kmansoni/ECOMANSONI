import { useQuery } from "@tanstack/react-query";
import { insuranceApi } from "@/lib/insurance/api";
import type { InsuranceCategory, InsuranceFilters } from "@/types/insurance";

/**
 * Хук для получения списка страховых продуктов
 */
export function useInsuranceProducts(filters?: InsuranceFilters) {
  return useQuery({
    queryKey: ["insurance-products-full", filters],
    queryFn: () => insuranceApi.getProducts(filters),
  });
}

/**
 * Хук для получения данных конкретного страхового продукта
 */
export function useInsuranceProduct(id: string | undefined) {
  return useQuery({
    queryKey: ["insurance-product", id],
    queryFn: () => insuranceApi.getProduct(id!),
    enabled: !!id,
  });
}

/**
 * Хук для получения популярных страховых продуктов
 */
export function usePopularProducts(category?: InsuranceCategory) {
  return useQuery({
    queryKey: ["insurance-products-popular-full", category],
    queryFn: () =>
      insuranceApi.getProducts({
        category,
        sort_by: "popularity",
        per_page: 10,
      }),
  });
}
