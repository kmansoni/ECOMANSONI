import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { insuranceApi } from "@/lib/insurance/api";
import type { InsuranceApplication } from "@/types/insurance";

const QUERY_KEY = "insurance-applications";

/**
 * Хук для создания заявки на страхование
 */
export function useCreateApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<InsuranceApplication>) =>
      insuranceApi.createApplication(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

/**
 * Хук для получения списка заявок текущего пользователя
 */
export function useApplications() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: () => insuranceApi.getApplications(),
  });
}

/**
 * Хук для получения данных конкретной заявки
 */
export function useApplication(id: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, id],
    queryFn: () => insuranceApi.getApplication(id!),
    enabled: !!id,
  });
}

/**
 * Хук для обновления заявки на страхование
 */
export function useUpdateApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<InsuranceApplication> }) =>
      insuranceApi.updateApplication(id, updates),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, variables.id] });
    },
  });
}
