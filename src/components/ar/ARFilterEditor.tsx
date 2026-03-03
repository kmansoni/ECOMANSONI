import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Check, Camera, Sliders } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ARFilterEditorProps {
  onClose?: () => void;
  onPublish?: (filterId: string) => void;
}

const BASE_EFFECTS = [
  { id: 'blur_bg', label: 'Размытие фона', emoji: '🌫️' },
  { id: 'vintage', label: 'Винтаж', emoji: '📷' },
  { id: 'rainbow', label: 'Радуга', emoji: '🌈' },
  { id: 'glitter', label: 'Блёстки', emoji: '✨' },
  { id: 'warm', label: 'Тёплый', emoji: '🌅' },
  { id: 'cool', label: 'Холодный', emoji: '❄️' },
  { id: 'dog_ears', label: 'Ушки', emoji: '🐶' },
  { id: 'hearts', label: 'Сердечки', emoji: '💕' },
];

const CATEGORIES = ['beauty', 'color', 'fun', 'world'] as const;
const CATEGORY_LABELS: Record<string, string> = {
  beauty: 'Красота', color: 'Цвет', fun: 'Забавные', world: 'Мир',
};

export function ARFilterEditor({ onClose, onPublish }: ARFilterEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [selectedEffect, setSelectedEffect] = useState<string | null>(null);
  const [intensity, setIntensity] = useState(70);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('fun');
  const [publishing, setPublishing] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraActive(true);
      } catch { /* no camera */ }
    })();
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const handlePublish = async () => {
    if (!name.trim()) { toast.error('Введите название фильтра'); return; }
    if (!selectedEffect) { toast.error('Выберите базовый эффект'); return; }

    setPublishing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Войдите в аккаунт'); return; }

      const { data, error } = await (supabase as any)
        .from('ar_filters')
        .insert({
          creator_id: user.id,
          name,
          category,
          filter_data: { effect: selectedEffect, intensity, version: 1 },
          is_published: true,
        })
        .select()
        .single();

      if (error) throw error;
      toast.success('Фильтр опубликован!');
      onPublish?.(data.id);
      onClose?.();
    } catch {
      toast.error('Ошибка при публикации');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <button onClick={onClose} className="text-zinc-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-white font-bold">Редактор фильтра</h2>
        <button
          onClick={handlePublish}
          disabled={publishing}
          className="flex items-center gap-1.5 bg-white text-black text-sm font-semibold px-4 py-1.5 rounded-full disabled:opacity-50"
        >
          <Check className="w-4 h-4" />
          {publishing ? 'Публикация...' : 'Опубликовать'}
        </button>
      </div>

      {/* Camera preview */}
      <div className="relative flex-1 bg-zinc-900 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{
            filter: selectedEffect === 'vintage' ? `sepia(${intensity}%)` :
                    selectedEffect === 'warm' ? `sepia(${intensity * 0.5}%) saturate(${100 + intensity}%)` :
                    selectedEffect === 'cool' ? `hue-rotate(${intensity * 2}deg)` :
                    selectedEffect === 'blur_bg' ? 'none' :
                    'none',
          }}
        />
        {!cameraActive && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Camera className="w-12 h-12 text-zinc-700" />
          </div>
        )}

        {/* Overlay effects */}
        {selectedEffect === 'rainbow' && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(45deg, rgba(255,0,0,0.2), rgba(255,165,0,0.2), rgba(255,255,0,0.2), rgba(0,255,0,0.2), rgba(0,0,255,0.2))', opacity: intensity / 100 }}
          />
        )}
        {selectedEffect === 'glitter' && (
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.3) 1px, transparent 1px)', backgroundSize: '20px 20px', opacity: intensity / 100 }} />
        )}
      </div>

      {/* Controls */}
      <div className="bg-zinc-950 px-4 pt-4 pb-6 space-y-4">
        {/* Name & Category */}
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Название фильтра"
            className="flex-1 bg-zinc-900 text-white placeholder-zinc-600 rounded-xl px-4 py-2.5 text-sm outline-none"
          />
          <select
            value={category}
            onChange={e => setCategory(e.target.value as typeof CATEGORIES[number])}
            className="bg-zinc-900 text-white rounded-xl px-3 py-2.5 text-sm outline-none"
          >
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>

        {/* Effects */}
        <div>
          <p className="text-zinc-400 text-xs mb-2">Базовый эффект</p>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {BASE_EFFECTS.map(e => (
              <button
                key={e.id}
                onClick={() => setSelectedEffect(selectedEffect === e.id ? null : e.id)}
                className={`shrink-0 flex flex-col items-center gap-1 p-3 rounded-2xl border-2 transition-all ${
                  selectedEffect === e.id ? 'border-white bg-white/10' : 'border-zinc-800 bg-zinc-900'
                }`}
              >
                <span className="text-2xl">{e.emoji}</span>
                <span className="text-xs text-white whitespace-nowrap">{e.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Intensity */}
        {selectedEffect && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-zinc-400 text-xs flex items-center gap-1">
                <Sliders className="w-3 h-3" /> Интенсивность
              </p>
              <span className="text-white text-xs">{intensity}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={intensity}
              onChange={e => setIntensity(Number(e.target.value))}
              className="w-full accent-white"
            />
          </div>
        )}
      </div>
    </div>
  );
}
