import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, Star, Diamond, Rocket, Crown, Flame } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { GiftType } from '@/types/livestream';

interface GiftDefinition {
  type: GiftType;
  label: string;
  price: number;
  Icon: React.ElementType;
  color: string;
}

const GIFTS: GiftDefinition[] = [
  { type: 'heart', label: 'Сердце', price: 10, Icon: Heart, color: 'text-pink-400' },
  { type: 'star', label: 'Звезда', price: 50, Icon: Star, color: 'text-yellow-400' },
  { type: 'diamond', label: 'Алмаз', price: 200, Icon: Diamond, color: 'text-cyan-400' },
  { type: 'rocket', label: 'Ракета', price: 500, Icon: Rocket, color: 'text-orange-400' },
  { type: 'crown', label: 'Корона', price: 1000, Icon: Crown, color: 'text-amber-400' },
  { type: 'fire', label: 'Огонь', price: 100, Icon: Flame, color: 'text-red-400' },
];

interface GiftSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (gift: GiftType, message: string) => Promise<void>;
}

/**
 * Bottom sheet for sending virtual gifts/donations during a stream.
 */
export function GiftSheet({ open, onOpenChange, onSend }: GiftSheetProps) {
  const [selected, setSelected] = useState<GiftType | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const selectedGift = GIFTS.find((g) => g.type === selected);

  const handleSend = async () => {
    if (!selected || sending) return;
    setSending(true);
    try {
      await onSend(selected, message.trim());
      setConfirmed(true);
      setTimeout(() => {
        setConfirmed(false);
        setSelected(null);
        setMessage('');
        onOpenChange(false);
      }, 1200);
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-zinc-900 text-white border-zinc-700 pb-safe">
        <SheetHeader>
          <SheetTitle className="text-white">Отправить подарок</SheetTitle>
        </SheetHeader>

        {/* Gift grid */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          {GIFTS.map(({ type, label, price, Icon, color }) => (
            <button
              key={type}
              onClick={() => setSelected(type)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all',
                selected === type
                  ? 'border-white bg-white/10'
                  : 'border-zinc-700 hover:border-zinc-500',
              )}
              aria-label={`${label} — ${price} монет`}
              aria-pressed={selected === type}
            >
              <Icon className={cn('h-8 w-8', color)} aria-hidden />
              <span className="text-xs font-medium">{label}</span>
              <span className="text-xs text-zinc-400">{price} 💎</span>
            </button>
          ))}
        </div>

        {/* Message field */}
        <div className="mt-4">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Сообщение к подарку (необязательно)"
            maxLength={100}
            className="bg-zinc-800 border-zinc-600 text-white placeholder:text-zinc-500"
          />
        </div>

        {/* Send button */}
        <div className="mt-4">
          <Button
            onClick={() => void handleSend()}
            disabled={!selected || sending}
            className="w-full bg-gradient-to-r from-pink-600 to-red-600 hover:from-pink-500 hover:to-red-500 text-white font-semibold"
          >
            {confirmed ? (
              <motion.span
                initial={{ scale: 0.8 }}
                animate={{ scale: 1.1 }}
                className="flex items-center gap-2"
              >
                ✓ Отправлено!
              </motion.span>
            ) : selectedGift ? (
              `Отправить ${selectedGift.label} (${selectedGift.price} 💎)`
            ) : (
              'Выберите подарок'
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
