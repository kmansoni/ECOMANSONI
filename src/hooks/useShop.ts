import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Json } from '@/integrations/supabase/types';

export interface Shop {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ShopProduct {
  id: string;
  shop_id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string | null;
  images: Json | null;
  category: string | null;
  in_stock: boolean | null;
  created_at: string;
}

export interface ProductTag {
  id: string;
  post_id: string;
  product_id: string;
  x_position: number;
  y_position: number;
  product?: ShopProduct;
}

export function useShop(shopId?: string) {
  const { user } = useAuth();
  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchShop = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('shops')
        .select('*')
        .eq('id', id)
        .single();
      setShop(data ? { ...data, is_active: data.is_active ?? false } : null);

      const { data: prods } = await supabase
        .from('shop_products')
        .select('*')
        .eq('shop_id', id)
        .order('created_at', { ascending: false });
      setProducts((prods ?? []).map(p => ({ ...p, in_stock: p.in_stock ?? null })));
    } finally {
      setLoading(false);
    }
  }, []);

  const getMyShop = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('shops')
        .select('*')
        .eq('owner_id', user.id)
        .maybeSingle();
      if (data) {
        setShop({ ...data, is_active: data.is_active ?? false });
        const { data: prods } = await supabase
          .from('shop_products')
          .select('*')
          .eq('shop_id', data.id)
          .order('created_at', { ascending: false });
        setProducts((prods ?? []).map(p => ({ ...p, in_stock: p.in_stock ?? null })));
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (shopId) {
      fetchShop(shopId);
    } else {
      getMyShop();
    }
  }, [shopId, fetchShop, getMyShop]);

  const createShop = useCallback(
    async (name: string, description: string, logoUrl?: string) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('shops')
        .insert({ owner_id: user.id, name, description, logo_url: logoUrl })
        .select()
        .single();
      if (error) throw error;
      const created = { ...data, is_active: data.is_active ?? false };
      setShop(created);
      return created as Shop;
    },
    [user]
  );

  const updateShop = useCallback(
    async (updates: Partial<Shop>) => {
      if (!shop) throw new Error('No shop');
      const { data, error } = await supabase
        .from('shops')
        .update(updates)
        .eq('id', shop.id)
        .select()
        .single();
      if (error) throw error;
      const updated = { ...data, is_active: data.is_active ?? false };
      setShop(updated);
      return updated as Shop;
    },
    [shop]
  );

  const addProduct = useCallback(
    async (productData: Omit<ShopProduct, 'id' | 'shop_id' | 'created_at'>) => {
      if (!shop) throw new Error('No shop');
      const { data, error } = await supabase
        .from('shop_products')
        .insert({ ...productData, shop_id: shop.id })
        .select()
        .single();
      if (error) throw error;
      setProducts(prev => [data, ...prev]);
      return data as ShopProduct;
    },
    [shop]
  );

  const updateProduct = useCallback(
    async (id: string, updates: Partial<ShopProduct>) => {
      const { data, error } = await supabase
        .from('shop_products')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      setProducts(prev => prev.map(p => (p.id === id ? data : p)));
      return data as ShopProduct;
    },
    []
  );

  const deleteProduct = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('shop_products')
      .delete()
      .eq('id', id);
    if (error) throw error;
    setProducts(prev => prev.filter(p => p.id !== id));
  }, []);

  return {
    shop,
    products,
    loading,
    createShop,
    updateShop,
    addProduct,
    updateProduct,
    deleteProduct,
    getMyShop,
  };
}

export function useProductTags(postId?: string) {
  const [tags, setTags] = useState<ProductTag[]>([]);

  useEffect(() => {
    if (!postId) return;
    supabase
      .from('product_tags')
      .select('*, product:shop_products(*)')
      .eq('post_id', postId)
      .then(({ data }) => {
        setTags((data ?? []) as unknown as ProductTag[]);
      });
  }, [postId]);

  const addTag = useCallback(
    async (pId: string, productId: string, x: number, y: number) => {
      const { data, error } = await supabase
        .from('product_tags')
        .insert({ post_id: pId, product_id: productId, x_position: x, y_position: y })
        .select('*, product:shop_products(*)')
        .single();
      if (error) throw error;
      setTags(prev => [...prev, data as unknown as ProductTag]);
      return data as unknown as ProductTag;
    },
    []
  );

  const removeTag = useCallback(async (tagId: string) => {
    const { error } = await supabase
      .from('product_tags')
      .delete()
      .eq('id', tagId);
    if (error) throw error;
    setTags(prev => prev.filter(t => t.id !== tagId));
  }, []);

  return { tags, addTag, removeTag };
}
