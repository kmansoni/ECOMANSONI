import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { supabase, dbLoose } from '@/lib/supabase';
import { useInsuranceWizardStore } from '@/stores/insurance-wizard-store';
import type { InsuranceDraft } from '@/types/insurance';
import { logger } from '@/lib/logger';

const DRAFTS_KEY = ['insurance', 'drafts'] as const;

export function useInsuranceDrafts() {
  return useQuery<InsuranceDraft[]>({
    queryKey: [...DRAFTS_KEY],
    queryFn: async () => {
      const { data, error } = await dbLoose
        .from('insurance_drafts')
        .select('id, user_id, product_type, step, form_data, title, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as InsuranceDraft[];
    },
    staleTime: 60_000,
  });
}

export function useDeleteDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draftId: string) => {
      const { error } = await dbLoose.from('insurance_drafts').delete().eq('id', draftId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...DRAFTS_KEY] }),
  });
}

export function useDraftAutoSave() {
  const { productType, step, formData, draftId, isDirty, setDraftId, markClean } =
    useInsuranceWizardStore();
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const save = useCallback(async () => {
    if (!productType || !isDirty) return;

    const title = buildTitle(productType, formData);

    try {
      if (draftId) {
        const { error } = await dbLoose
          .from('insurance_drafts')
          .update({ step, form_data: formData, title, updated_at: new Date().toISOString() })
          .eq('id', draftId);
        if (!error) markClean();
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await dbLoose
          .from('insurance_drafts')
          .insert({ user_id: user.id, product_type: productType, step, form_data: formData, title })
          .select('id')
          .single();

        if (!error && data) {
          setDraftId((data as unknown as { id: string }).id);
          markClean();
        }
      }
      qc.invalidateQueries({ queryKey: [...DRAFTS_KEY] });
    } catch (err) {
      logger.error('[useDraftAutoSave] не удалось сохранить черновик', { err });
    }
  }, [productType, step, formData, draftId, isDirty, setDraftId, markClean, qc]);

  useEffect(() => {
    if (!isDirty) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(save, 3000);
    return () => clearTimeout(timer.current);
  }, [isDirty, save]);

  return { saveNow: save };
}

// ── title builder ──

const TYPE_LABELS: Record<string, string> = {
  osago: 'ОСАГО', kasko: 'КАСКО', dms: 'ДМС', travel: 'ВЗР',
  property: 'Имущество', mortgage: 'Ипотечное', life: 'Жизнь',
};

function buildTitle(type: string, data: Record<string, unknown>): string {
  const brand = (data.brand || data.vehicle_make) as string | undefined;
  const model = (data.model || data.vehicle_model) as string | undefined;
  const year = data.year || data.vehicle_year;
  if (brand && model) return `${brand} ${model}${year ? ` ${year}` : ''}`;

  const country = (data.destination_country || data.country) as string | undefined;
  const days = data.trip_duration_days || data.days;
  if (country) return `${country}${days ? ` ${days}д` : ''}`;

  return TYPE_LABELS[type] ?? type;
}
