import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Minus, Plus } from 'lucide-react';

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  sku?: string;
  price: number;
  stock: number;
  attributes: Record<string, string>;
}

interface ProductVariantPickerProps {
  productId: string;
  basePrice?: number;
  onVariantChange?: (variant: ProductVariant | null, quantity: number) => void;
}

export function ProductVariantPicker({ productId, basePrice = 0, onVariantChange }: ProductVariantPickerProps) {
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data } = await (supabase as any)
        .from('product_variants')
        .select('*')
        .eq('product_id', productId)
        .order('price');
      setVariants(data ?? []);
      if (data?.length) setSelectedId(data[0].id);
      setLoading(false);
    })();
  }, [productId]);

  const selected = variants.find(v => v.id === selectedId) ?? null;
  const price = selected?.price ?? basePrice;
  const stock = selected?.stock ?? 999;

  useEffect(() => {
    onVariantChange?.(selected, quantity);
  }, [selectedId, quantity]);

  // Group by attributes keys
  const attributeKeys = [...new Set(variants.flatMap(v => Object.keys(v.attributes)))];

  const selectVariant = (id: string) => {
    setSelectedId(id);
    setQuantity(1);
  };

  if (loading) return null;
  if (variants.length === 0) return (
    <div className="flex items-center justify-between py-2">
      <span className="text-white font-bold text-xl">{basePrice.toLocaleString('ru-RU')} ₽</span>
      <QuantityPicker value={quantity} max={999} onChange={setQuantity} />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Price */}
      <div className="flex items-center justify-between">
        <span className="text-white font-bold text-xl">{price.toLocaleString('ru-RU')} ₽</span>
        <span className={`text-sm font-medium ${stock > 0 ? 'text-green-400' : 'text-red-400'}`}>
          {stock > 0 ? `В наличии: ${stock}` : 'Нет в наличии'}
        </span>
      </div>

      {/* Variant list */}
      {variants.length > 1 && (
        <div>
          <p className="text-zinc-400 text-xs mb-2">Вариант</p>
          <div className="flex flex-wrap gap-2">
            {variants.map(v => (
              <button
                key={v.id}
                onClick={() => selectVariant(v.id)}
                disabled={v.stock === 0}
                className={`px-3 py-1.5 rounded-xl text-sm border-2 transition-all ${
                  selectedId === v.id
                    ? 'border-white text-white bg-white/10'
                    : v.stock === 0
                    ? 'border-zinc-800 text-zinc-600 line-through cursor-not-allowed'
                    : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'
                }`}
              >
                {v.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quantity */}
      <div className="flex items-center justify-between">
        <span className="text-zinc-400 text-sm">Количество</span>
        <QuantityPicker value={quantity} max={stock} onChange={setQuantity} />
      </div>
    </div>
  );
}

function QuantityPicker({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => onChange(Math.max(1, value - 1))}
        className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-white hover:bg-zinc-700"
      >
        <Minus className="w-4 h-4" />
      </button>
      <span className="text-white font-medium w-6 text-center">{value}</span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
