import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { dbLoose } from "@/lib/supabase";

export interface ReturnRequest {
  orderId: string;
  reason: string;
  description?: string;
}

export function useReturns() {
  const createReturn = useCallback(async (req: ReturnRequest) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await dbLoose
      .from('return_requests')
      .insert({
        order_id: req.orderId,
        user_id: user.id,
        reason: req.reason,
        description: req.description,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      toast.error('Ошибка при создании запроса на возврат');
      return null;
    }
    toast.success('Заявка на возврат создана');
    return data;
  }, []);

  const getMyReturns = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data } = await dbLoose
      .from('return_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    return data ?? [];
  }, []);

  const cancelReturn = useCallback(async (returnId: string) => {
    const { error } = await dbLoose
      .from('return_requests')
      .delete()
      .eq('id', returnId);
    if (error) {
      toast.error('Ошибка отмены заявки');
      return;
    }
    toast.success('Заявка отменена');
  }, []);

  return { createReturn, getMyReturns, cancelReturn };
}
