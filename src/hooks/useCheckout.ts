import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DeliveryAddress {
  fullName: string;
  phone: string;
  city: string;
  street: string;
  building: string;
  apartment?: string;
  postalCode: string;
}

export interface CheckoutData {
  items: { productId: string; variantId?: string; quantity: number; price: number }[];
  address: DeliveryAddress;
  deliveryMethod: 'courier' | 'pickup' | 'mail';
  paymentMethod: 'card' | 'cash';
  shopId: string;
  totalAmount: number;
  deliveryCost: number;
}

export function validateAddress(addr: Partial<DeliveryAddress>): string[] {
  const errors: string[] = [];
  if (!addr.fullName?.trim()) errors.push('Введите имя получателя');
  if (!addr.phone?.match(/^\+?[\d\s\-()]{10,15}$/)) errors.push('Введите корректный номер телефона');
  if (!addr.city?.trim()) errors.push('Введите город');
  if (!addr.street?.trim()) errors.push('Введите улицу');
  if (!addr.building?.trim()) errors.push('Введите номер дома');
  if (!addr.postalCode?.match(/^\d{6}$/)) errors.push('Введите корректный индекс (6 цифр)');
  return errors;
}

export function useCheckout() {
  const [loading, setLoading] = useState(false);

  const createOrder = useCallback(async (data: CheckoutData) => {
    const errors = validateAddress(data.address);
    if (errors.length > 0) {
      errors.forEach(e => toast.error(e));
      return null;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Не авторизован');

      const { data: order, error } = await (supabase as any)
        .from('shop_orders')
        .insert({
          user_id: user.id,
          shop_id: data.shopId,
          items: data.items,
          delivery_address: data.address,
          delivery_method: data.deliveryMethod,
          payment_method: data.paymentMethod,
          total_amount: data.totalAmount,
          delivery_cost: data.deliveryCost,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      return order;
    } catch (e: any) {
      toast.error('Ошибка при оформлении заказа: ' + e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const getOrderStatus = useCallback(async (orderId: string) => {
    const { data, error } = await (supabase as any)
      .from('shop_orders')
      .select('*')
      .eq('id', orderId)
      .single();
    if (error) throw error;
    return data;
  }, []);

  const getMyOrders = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data } = await (supabase as any)
      .from('shop_orders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    return data ?? [];
  }, []);

  const cancelOrder = useCallback(async (orderId: string) => {
    const { error } = await (supabase as any)
      .from('shop_orders')
      .update({ status: 'cancelled' })
      .eq('id', orderId);
    if (error) throw error;
    toast.success('Заказ отменён');
  }, []);

  return { createOrder, getOrderStatus, getMyOrders, cancelOrder, loading };
}
