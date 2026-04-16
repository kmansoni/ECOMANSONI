import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ChevronRight } from 'lucide-react';
import { dbLoose } from "@/lib/supabase";

interface CollectionProduct {
  id: string;
  name: string;
  price: number;
  image_url?: string;
}

interface Collection {
  id: string;
  name: string;
  description?: string;
  cover_url?: string;
  products?: CollectionProduct[];
}

interface ProductCollectionProps {
  collectionId?: string;
  collection?: Collection;
  onProductClick?: (productId: string) => void;
}

export function ProductCollection({ collectionId, collection: collectionProp, onProductClick }: ProductCollectionProps) {
  const [collection, setCollection] = useState<Collection | null>(collectionProp ?? null);
  const [products, setProducts] = useState<CollectionProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (collectionProp) {
      setCollection(collectionProp);
      setProducts(collectionProp.products ?? []);
      setLoading(false);
      return;
    }
    if (!collectionId) { setLoading(false); return; }

    void (async () => {
      // shop_collections, shop_collection_items, products — нет в сгенерированных типах Supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: col } = await dbLoose
        .from('shop_collections')
        .select('*')
        .eq('id', collectionId)
        .single();
      setCollection(col);

      const { data: items } = await dbLoose
        .from('shop_collection_items')
        .select('product_id, position')
        .eq('collection_id', collectionId)
        .order('position');

      if (items?.length) {
        const ids = items.map((i: { product_id: string }) => i.product_id);
        const { data: prods } = await dbLoose
          .from('products')
          .select('id, name, price, image_url')
          .in('id', ids);
        setProducts(prods ?? []);
      }
      setLoading(false);
    })();
  }, [collectionId, collectionProp]);

  if (loading || !collection) return null;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h3 className="text-white font-bold">{collection.name}</h3>
          {collection.description && (
            <p className="text-zinc-500 text-xs mt-0.5">{collection.description}</p>
          )}
        </div>
        <button className="flex items-center gap-1 text-zinc-400 text-sm hover:text-white">
          <span>Все</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Cover */}
      {collection.cover_url && (
        <div className="relative h-32 rounded-2xl overflow-hidden">
          <img loading="lazy" src={collection.cover_url} alt={collection.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        </div>
      )}

      {/* Horizontal scroll products */}
      {products.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {products.map(product => (
            <button
              key={product.id}
              onClick={() => onProductClick?.(product.id)}
              className="shrink-0 w-36 bg-zinc-900 rounded-2xl overflow-hidden text-left hover:bg-zinc-800 transition-colors"
            >
              {product.image_url ? (
                <img loading="lazy" src={product.image_url} alt={product.name} className="w-full h-36 object-cover" />
              ) : (
                <div className="w-full h-36 bg-zinc-800" />
              )}
              <div className="p-2">
                <p className="text-white text-xs font-medium truncate">{product.name}</p>
                <p className="text-zinc-400 text-xs mt-0.5">{product.price.toLocaleString('ru-RU')} ₽</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
