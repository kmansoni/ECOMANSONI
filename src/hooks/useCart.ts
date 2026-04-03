/**
 * useCart — хук управления корзиной маркетплейса.
 *
 * Получение корзины (shop_cart_items JOIN shop_products),
 * добавление, обновление количества, удаление, очистка.
 * React Query с optimistic updates.
 */

import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';

interface CartProduct {
  id: string;
  name: string;
  price: number;
  currency: string;
  image_url: string | null;
  is_available: boolean;
}

export interface CartItem {
  id: string;
  user_id: string;
  product_id: string;
  quantity: number;
  created_at: string;
  product: CartProduct;
}

const CART_QUERY_KEY = ['cart'] as const;

async function fetchCart(userId: string): Promise<CartItem[]> {
  const { data, error } = await (supabase as unknown as { from: (t: string) => unknown })
    .from('shop_cart_items')
    // @ts-expect-error — таблица не в сгенерированных типах
    .select('id, user_id, product_id, quantity, created_at, product:shop_products(id, name, price, currency, image_url, is_available)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    logger.error('[useCart] Ошибка загрузки корзины', { userId, error });
    throw error;
  }
  return (data ?? []) as unknown as CartItem[];
}

export function useCart() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: items = [], isLoading, error, refetch } = useQuery({
    queryKey: CART_QUERY_KEY,
    queryFn: () => fetchCart(user!.id),
    enabled: !!user,
    staleTime: 30_000,
  });

  const cartTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    [items],
  );

  const cartCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items],
  );

  const currency = items[0]?.product.currency ?? 'RUB';

  const addToCartMutation = useMutation({
    mutationFn: async ({ productId, quantity = 1 }: { productId: string; quantity?: number }) => {
      if (!user) throw new Error('Требуется авторизация');
      const { data, error } = await (supabase as any)
        .from('shop_cart_items')
        .upsert(
          { user_id: user.id, product_id: productId, quantity },
          { onConflict: 'user_id,product_id' },
        )
        .select('id, user_id, product_id, quantity, created_at, product:shop_products(id, name, price, currency, image_url, is_available)')
        .single();

      if (error) throw error;
      return data as unknown as CartItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY });
      toast.success('Товар добавлен в корзину');
    },
    onError: (err: Error) => {
      logger.error('[useCart] Ошибка добавления в корзину', { error: err });
      toast.error('Не удалось добавить товар в корзину');
    },
  });

  const updateQuantityMutation = useMutation({
    mutationFn: async ({ itemId, quantity }: { itemId: string; quantity: number }) => {
      if (quantity < 1) throw new Error('Количество должно быть >= 1');
      const { data, error } = await (supabase as any)
        .from('shop_cart_items')
        .update({ quantity })
        .eq('id', itemId)
        .select('id, user_id, product_id, quantity, created_at, product:shop_products(id, name, price, currency, image_url, is_available)')
        .single();

      if (error) throw error;
      return data as unknown as CartItem;
    },
    onMutate: async ({ itemId, quantity }) => {
      await queryClient.cancelQueries({ queryKey: CART_QUERY_KEY });
      const previous = queryClient.getQueryData<CartItem[]>(CART_QUERY_KEY);
      queryClient.setQueryData<CartItem[]>(CART_QUERY_KEY, old =>
        old?.map(item => (item.id === itemId ? { ...item, quantity } : item)) ?? [],
      );
      return { previous };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(CART_QUERY_KEY, ctx.previous);
      logger.error('[useCart] Ошибка обновления количества', { error: err });
      toast.error('Не удалось обновить количество');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY });
    },
  });

  const removeFromCartMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await (supabase as any)
        .from('shop_cart_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
    },
    onMutate: async (itemId: string) => {
      await queryClient.cancelQueries({ queryKey: CART_QUERY_KEY });
      const previous = queryClient.getQueryData<CartItem[]>(CART_QUERY_KEY);
      queryClient.setQueryData<CartItem[]>(CART_QUERY_KEY, old =>
        old?.filter(item => item.id !== itemId) ?? [],
      );
      return { previous };
    },
    onError: (err: Error, _itemId, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(CART_QUERY_KEY, ctx.previous);
      logger.error('[useCart] Ошибка удаления из корзины', { error: err });
      toast.error('Не удалось удалить товар из корзины');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY });
    },
  });

  const clearCartMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Требуется авторизация');
      const { error } = await (supabase as any)
        .from('shop_cart_items')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: CART_QUERY_KEY });
      const previous = queryClient.getQueryData<CartItem[]>(CART_QUERY_KEY);
      queryClient.setQueryData<CartItem[]>(CART_QUERY_KEY, []);
      return { previous };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(CART_QUERY_KEY, ctx.previous);
      logger.error('[useCart] Ошибка очистки корзины', { error: err });
      toast.error('Не удалось очистить корзину');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY });
    },
  });

  const addToCart = useCallback(
    (productId: string, quantity?: number) => addToCartMutation.mutate({ productId, quantity }),
    [addToCartMutation],
  );

  const updateQuantity = useCallback(
    (itemId: string, quantity: number) => updateQuantityMutation.mutate({ itemId, quantity }),
    [updateQuantityMutation],
  );

  const removeFromCart = useCallback(
    (itemId: string) => removeFromCartMutation.mutate(itemId),
    [removeFromCartMutation],
  );

  const clearCart = useCallback(
    () => clearCartMutation.mutate(),
    [clearCartMutation],
  );

  return {
    items,
    isLoading,
    error,
    refetch,
    cartTotal,
    cartCount,
    currency,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    isAdding: addToCartMutation.isPending,
    isUpdating: updateQuantityMutation.isPending,
    isRemoving: removeFromCartMutation.isPending,
    isClearing: clearCartMutation.isPending,
  };
}
