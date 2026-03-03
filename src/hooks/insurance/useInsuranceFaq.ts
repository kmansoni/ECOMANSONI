import { useQuery } from "@tanstack/react-query";
import { insuranceApi } from "@/lib/insurance/api";
import type { InsuranceCategory } from "@/types/insurance";

/**
 * Хук для получения FAQ по страхованию
 */
export function useInsuranceFaq(category?: InsuranceCategory | "general") {
  return useQuery({
    queryKey: ["insurance-faq", category],
    queryFn: () => insuranceApi.getFaq(category),
  });
}
