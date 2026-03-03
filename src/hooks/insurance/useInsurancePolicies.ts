import { useQuery } from "@tanstack/react-query";
import { insuranceApi } from "@/lib/insurance/api";
import type { InsuranceFilters } from "@/types/insurance";
import { EXPIRING_DAYS_THRESHOLD } from "@/lib/insurance/constants";

const QUERY_KEY = "insurance-policies";

/**
 * Хук для получения полисов пользователя с фильтрацией
 */
export function useInsurancePolicies(filters?: InsuranceFilters) {
  return useQuery({
    queryKey: [QUERY_KEY, filters],
    queryFn: () => insuranceApi.getPolicies(filters),
  });
}

/**
 * Хук для получения данных конкретного полиса
 */
export function useInsurancePolicy(id: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, id],
    queryFn: () => insuranceApi.getPolicy(id!),
    enabled: !!id,
  });
}

/**
 * Хук для получения полисов, срок которых истекает в ближайшее время
 */
export function useExpiringPolicies() {
  return useQuery({
    queryKey: [QUERY_KEY, "expiring"],
    queryFn: async () => {
      const policies = await insuranceApi.getPolicies({ sort_by: "popularity" });
      const now = new Date();
      const threshold = new Date(now.getTime() + EXPIRING_DAYS_THRESHOLD * 24 * 60 * 60 * 1000);

      return policies.filter((policy) => {
        const endDate = new Date(policy.end_date);
        return (
          policy.status === "active" &&
          endDate <= threshold &&
          endDate >= now
        );
      });
    },
  });
}
