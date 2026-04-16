/**
 * CartSheet — панель корзины маркетплейса (Sheet снизу).
 *
 * Список товаров, управление количеством, итого, оформление заказа.
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Minus, Plus, Trash2, ShoppingBag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useCart, type CartItem } from '@/hooks/useCart';

interface CartSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_QUANTITY = 99;

function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(price);
}

function CartItemRow({
  item,
  onUpdateQuantity,
  onRemove,
  isUpdating,
}: {
  item: CartItem;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
  isUpdating: boolean;
}) {
  const price = formatPrice(item.product.price * item.quantity, item.product.currency);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20, height: 0 }}
      className="flex gap-3 py-3 border-b border-zinc-800 last:border-b-0"
    >
      {/* Фото товара */}
      <div className="w-16 h-16 rounded-xl bg-zinc-800 overflow-hidden shrink-0">
        {item.product.image_url ? (
          <img loading="lazy" src={item.product.image_url}
            alt={item.product.name}
            className="w-full h-full object-cover"
            
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            <ShoppingBag className="w-6 h-6" />
          </div>
        )}
      </div>

      {/* Информация */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-medium leading-tight line-clamp-2">
          {item.product.name}
        </p>
        <p className="text-sm font-bold text-white mt-1">{price}</p>

        {!item.product.is_available && (
          <span className="text-xs text-red-400">Нет в наличии</span>
        )}

        {/* Управление количеством */}
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
            disabled={item.quantity <= 1 || isUpdating}
            className="min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg bg-zinc-800 text-white disabled:opacity-40 active:scale-95 transition-transform"
            aria-label="Уменьшить количество"
          >
            <Minus className="w-4 h-4" />
          </button>

          <span className="text-sm text-white font-medium min-w-[24px] text-center tabular-nums">
            {item.quantity}
          </span>

          <button
            onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
            disabled={item.quantity >= MAX_QUANTITY || isUpdating}
            className="min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg bg-zinc-800 text-white disabled:opacity-40 active:scale-95 transition-transform"
            aria-label="Увеличить количество"
          >
            <Plus className="w-4 h-4" />
          </button>

          <button
            onClick={() => onRemove(item.id)}
            className="ml-auto min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg text-red-400 hover:bg-red-500/10 active:scale-95 transition-all"
            aria-label="Удалить из корзины"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function CartSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex gap-3">
          <Skeleton className="w-16 h-16 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-8 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CartSheet({ open, onOpenChange }: CartSheetProps) {
  const navigate = useNavigate();
  const {
    items,
    isLoading,
    error,
    refetch,
    cartTotal,
    cartCount,
    currency,
    updateQuantity,
    removeFromCart,
    clearCart,
    isUpdating,
    isClearing,
  } = useCart();

  const handleCheckout = useCallback(() => {
    onOpenChange(false);
    navigate('/shop/checkout');
  }, [navigate, onOpenChange]);

  const formattedTotal = formatPrice(cartTotal, currency);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl bg-zinc-900 border-zinc-800 max-h-[85vh] flex flex-col p-0"
        hideCloseButton
      >
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-zinc-800 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-blue-400" />
              <SheetTitle className="text-white font-bold text-lg">
                Корзина
                {cartCount > 0 && (
                  <Badge variant="secondary" className="ml-2 bg-blue-500/20 text-blue-400 border-blue-500/30">
                    {cartCount}
                  </Badge>
                )}
              </SheetTitle>
            </div>

            {items.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearCart}
                disabled={isClearing}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs"
              >
                Очистить
              </Button>
            )}
          </div>
          <SheetDescription className="sr-only">
            Управление товарами в корзине
          </SheetDescription>
        </SheetHeader>

        {/* Контент */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4">
          {isLoading ? (
            <CartSkeleton />
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-destructive text-sm">Не удалось загрузить корзину</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Повторить
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
              <ShoppingCart className="w-16 h-16 opacity-30" />
              <p className="text-base font-medium">Корзина пуста</p>
              <p className="text-sm">Добавьте товары, чтобы оформить заказ</p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {items.map(item => (
                <CartItemRow
                  key={item.id}
                  item={item}
                  onUpdateQuantity={updateQuantity}
                  onRemove={removeFromCart}
                  isUpdating={isUpdating}
                />
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Footer: итого + кнопка */}
        {items.length > 0 && (
          <SheetFooter className="px-4 py-4 border-t border-zinc-800 shrink-0">
            <div className="w-full space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-sm">
                  {cartCount} {pluralItems(cartCount)}
                </span>
                <span className="text-white font-bold text-lg">{formattedTotal}</span>
              </div>

              <Button
                onClick={handleCheckout}
                className="w-full min-h-[48px] text-base font-semibold"
                size="lg"
              >
                <ShoppingBag className="w-5 h-5 mr-2" />
                Оформить заказ
              </Button>
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Badge-счётчик для иконки корзины в навбаре */
export function CartBadge({ className }: { className?: string }) {
  const { cartCount } = useCart();

  if (cartCount === 0) return null;

  return (
    <span
      className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 ${className ?? ''}`}
      aria-label={`${cartCount} ${pluralItems(cartCount)} в корзине`}
    >
      {cartCount > 99 ? '99+' : cartCount}
    </span>
  );
}

function pluralItems(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'товар';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'товара';
  return 'товаров';
}
