import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { insuranceApi } from "@/lib/insurance/api";
import type { InsuranceClaim } from "@/types/insurance";

const QUERY_KEY = "insurance-claims";

/**
 * Хук для получения списка страховых случаев пользователя
 */
export function useClaims() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: () => insuranceApi.getClaims(),
  });
}

/**
 * Хук для получения данных конкретного страхового случая
 */
export function useClaim(id: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, id],
    queryFn: () => insuranceApi.getClaim(id!),
    enabled: !!id,
  });
}

/**
 * Хук для подачи заявления о страховом случае
 */
export function useCreateClaim() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<InsuranceClaim>) => insuranceApi.createClaim(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}
