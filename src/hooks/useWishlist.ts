import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useWishlist() {
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await (supabase as any)
        .from('wishlists')
        .select('product_id')
        .eq('user_id', user.id);
      if (data) setWishlistIds(new Set(data.map((r: any) => r.product_id)));
    })();
  }, []);

  const addToWishlist = useCallback(async (productId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setWishlistIds(prev => new Set([...prev, productId]));
    const { error } = await (supabase as any)
      .from('wishlists')
      .insert({ user_id: user.id, product_id: productId });
    if (error) {
      setWishlistIds(prev => { const n = new Set(prev); n.delete(productId); return n; });
      toast.error('Ошибка добавления в избранное');
    } else {
      toast.success('Добавлено в избранное');
    }
  }, []);

  const removeFromWishlist = useCallback(async (productId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setWishlistIds(prev => { const n = new Set(prev); n.delete(productId); return n; });
    await (supabase as any)
      .from('wishlists')
      .delete()
      .eq('user_id', user.id)
      .eq('product_id', productId);
  }, []);

  const getWishlist = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data } = await (supabase as any)
      .from('wishlists')
      .select('product_id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    return data ?? [];
  }, []);

  const isInWishlist = useCallback((productId: string) => wishlistIds.has(productId), [wishlistIds]);

  const toggleWishlist = useCallback(async (productId: string) => {
    if (isInWishlist(productId)) {
      await removeFromWishlist(productId);
    } else {
      await addToWishlist(productId);
    }
  }, [isInWishlist, addToWishlist, removeFromWishlist]);

  return { addToWishlist, removeFromWishlist, getWishlist, isInWishlist, toggleWishlist, wishlistIds, loading };
}
