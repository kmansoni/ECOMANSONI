/**
 * @file src/components/shop/LiveShoppingOverlay.tsx
 * @description Live Shopping — продажа товаров во время Live трансляции.
 * Instagram Live Shopping стиль.
 *
 * Архитектура:
 * - Хост пинит товары из своего магазина во время трансляции
 * - Зрители видят карточку товара внизу экрана
 * - Tap на карточку → открывает ProductCard с кнопкой "Купить"
 * - Realtime: Supabase Broadcast для мгновенного показа товара всем зрителям
 * - Таблица live_shopping_pins (live_session_id, product_id, pinned_at, is_active)
 * - Анимация: slide-up при появлении нового товара
 */

import { useState, useEffect, useCallback } from "react";
import { ShoppingBag, X, ChevronRight, Tag, Star } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface LiveProduct {
  id: string;
  title: string;
  price: number;
  currency: string;
  image_url: string | null;
  stock: number;
  rating?: number;
  review_count?: number;
}

interface LiveShoppingOverlayProps {
  liveSessionId: string;
  isHost: boolean;
  onProductPress: (product: LiveProduct) => void;
}

export function LiveShoppingOverlay({
  liveSessionId,
  isHost,
  onProductPress,
}: LiveShoppingOverlayProps) {
  const { user } = useAuth();
  const [pinnedProduct, setPinnedProduct] = useState<LiveProduct | null>(null);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [myProducts, setMyProducts] = useState<LiveProduct[]>([]);
  const [isPinning, setIsPinning] = useState(false);

  // Подписка на пины товаров (для зрителей)
  useEffect(() => {
    const db = supabase as any;
    const channel = db
      .channel(`live_shopping_${liveSessionId}`)
      .on("broadcast", { event: "product_pin" }, (payload: any) => {
        if (payload.payload?.product) {
          setPinnedProduct(payload.payload.product);
        } else {
          setPinnedProduct(null);
        }
      })
      .subscribe();

    return () => { db.removeChannel(channel); };
  }, [liveSessionId]);

  // Загрузка товаров хоста
  const loadMyProducts = async () => {
    if (!user) return;
    const db = supabase as any;
    const { data: shop } = await db
      .from("shops")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!shop) return;

    const { data: products } = await db
      .from("products")
      .select("id, title, price, currency, images, stock")
      .eq("shop_id", shop.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(20);

    setMyProducts(
      (products ?? []).map((p: any) => ({
        ...p,
        image_url: p.images?.[0] ?? null,
      }))
    );
  };

  const handlePinProduct = async (product: LiveProduct) => {
    setIsPinning(true);
    const db = supabase as any;

    // Broadcast всем зрителям
    await db.channel(`live_shopping_${liveSessionId}`).send({
      type: "broadcast",
      event: "product_pin",
      payload: { product },
    });

    // Сохраняем в БД
    await db.from("live_shopping_pins").upsert(
      {
        live_session_id: liveSessionId,
        product_id: product.id,
        host_id: user?.id,
        is_active: true,
        pinned_at: new Date().toISOString(),
      },
      { onConflict: "live_session_id" }
    );

    setPinnedProduct(product);
    setShowProductPicker(false);
    setIsPinning(false);
    toast.success("Товар показан зрителям");
  };

  const handleUnpin = async () => {
    const db = supabase as any;
    await db.channel(`live_shopping_${liveSessionId}`).send({
      type: "broadcast",
      event: "product_pin",
      payload: { product: null },
    });
    await db
      .from("live_shopping_pins")
      .update({ is_active: false })
      .eq("live_session_id", liveSessionId);
    setPinnedProduct(null);
  };

  return (
    <>
      {/* Кнопка для хоста */}
      {isHost && (
        <button
          onClick={() => { loadMyProducts(); setShowProductPicker(true); }}
          className="flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1.5"
        >
          <ShoppingBag className="w-4 h-4 text-white" />
          <span className="text-white text-sm">Товар</span>
        </button>
      )}

      {/* Карточка товара для зрителей */}
      <AnimatePresence>
        {pinnedProduct && (
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 60 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="absolute bottom-24 left-4 right-4 z-20"
          >
            <div
              className="bg-white/95 backdrop-blur-sm rounded-2xl p-3 flex items-center gap-3 shadow-xl cursor-pointer"
              onClick={() => onProductPress(pinnedProduct)}
            >
              {/* Изображение */}
              <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-muted">
                {pinnedProduct.image_url ? (
                  <img
                    src={pinnedProduct.image_url}
                    alt={pinnedProduct.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ShoppingBag className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* Инфо */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-black truncate">{pinnedProduct.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-base font-bold text-black">
                    {pinnedProduct.price} {pinnedProduct.currency}
                  </span>
                  {pinnedProduct.stock <= 5 && pinnedProduct.stock > 0 && (
                    <span className="text-xs text-orange-500 font-medium">
                      Осталось {pinnedProduct.stock}
                    </span>
                  )}
                </div>
                {pinnedProduct.rating && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                    <span className="text-xs text-gray-600">{pinnedProduct.rating.toFixed(1)}</span>
                  </div>
                )}
              </div>

              {/* CTA */}
              <div className="flex flex-col items-end gap-1">
                <div className="bg-black rounded-full px-3 py-1.5">
                  <span className="text-white text-xs font-semibold">Купить</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </div>

              {/* Закрыть (только хост) */}
              {isHost && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleUnpin(); }}
                  className="absolute top-2 right-2 w-5 h-5 bg-black/20 rounded-full flex items-center justify-center"
                >
                  <X className="w-3 h-3 text-black" />
                </button>
              )}
            </div>

            {/* Live Shopping бейдж */}
            <div className="absolute -top-2 left-4 bg-red-500 rounded-full px-2 py-0.5 flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span className="text-white text-xs font-bold">LIVE</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sheet выбора товара для хоста */}
      <Sheet open={showProductPicker} onOpenChange={setShowProductPicker}>
        <SheetContent side="bottom" className="rounded-t-2xl h-[60vh] flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5" />
              Показать товар
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto mt-4">
            {myProducts.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12">
                <ShoppingBag className="w-10 h-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground text-center">
                  Нет товаров в магазине.<br />
                  Добавьте товары в разделе Магазин.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {myProducts.map((product) => (
                  <div
                    key={product.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors",
                      pinnedProduct?.id === product.id
                        ? "bg-primary/10 border border-primary"
                        : "hover:bg-muted/50"
                    )}
                    onClick={() => handlePinProduct(product)}
                  >
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ShoppingBag className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{product.title}</p>
                      <p className="text-sm font-bold">{product.price} {product.currency}</p>
                    </div>
                    {pinnedProduct?.id === product.id && (
                      <div className="flex items-center gap-1 text-primary text-xs font-semibold">
                        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                        Live
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
