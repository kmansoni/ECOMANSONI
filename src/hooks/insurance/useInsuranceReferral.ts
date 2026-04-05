import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, dbLoose } from '@/lib/supabase';
import type { ReferralLink, ReferralLinkType } from '@/types/insurance';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';

const LINKS_KEY = ['insurance', 'referral-links'] as const;
const MAX_LINKS = 50;

async function getAgentId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Не авторизован');

  const { data, error } = await dbLoose
    .from('agent_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (error || !data) throw new Error('Профиль агента не найден');
  return (data as unknown as { id: string }).id;
}

export function useReferralLinks() {
  return useQuery<ReferralLink[]>({
    queryKey: [...LINKS_KEY],
    queryFn: async () => {
      let agentId: string;
      try {
        agentId = await getAgentId();
      } catch {
        return [];
      }

      const { data, error } = await dbLoose
        .from('insurance_referral_links')
        .select('*')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .limit(MAX_LINKS);

      if (error) throw error;
      return (data ?? []) as unknown as ReferralLink[];
    },
    staleTime: 60_000,
  });
}

export function useCreateReferralLink() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { type: ReferralLinkType; name?: string; quotaPercent?: number }) => {
      const agentId = await getAgentId();

      // лимит ссылок
      const { count } = await dbLoose
        .from('insurance_referral_links')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', agentId);

      if ((count ?? 0) >= MAX_LINKS) throw new Error(`Достигнут лимит ссылок (${MAX_LINKS})`);

      const { data, error } = await dbLoose
        .from('insurance_referral_links')
        .insert({
          agent_id: agentId,
          type: params.type,
          name: params.name ?? null,
          quota_percent: params.quotaPercent ?? 0,
        })
        .select()
        .single();

      if (error) throw error;
      return data as unknown as ReferralLink;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...LINKS_KEY] });
      toast.success('Ссылка создана');
    },
    onError: (err: Error) => {
      logger.error('[useCreateReferralLink] ошибка', { msg: err.message });
      toast.error(err.message);
    },
  });
}
