import { useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { insuranceApi } from '@/lib/insurance/api';
import type { VehicleLookupResult } from '@/types/insurance-providers';

export function useVehicleLookup() {
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const mutation = useMutation<VehicleLookupResult, Error, string>({
    mutationFn: (plate) => insuranceApi.lookupVehicle(plate),
  });

  const lookup = useCallback((plate: string) => {
    const cleaned = plate.replace(/\s/g, '');
    if (cleaned.length < 6) return;

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => mutation.mutate(plate), 500);
  }, [mutation]);

  return {
    lookup,
    vehicle: mutation.data ?? null,
    isLoading: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
