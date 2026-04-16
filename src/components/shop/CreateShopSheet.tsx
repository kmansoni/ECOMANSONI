import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Store, Upload, Loader2 } from 'lucide-react';
import { useShop } from '@/hooks/useShop';
import { uploadMedia } from '@/lib/mediaUpload';
import { toast } from 'sonner';

interface CreateShopSheetProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function CreateShopSheet({ open, onClose, onCreated }: CreateShopSheetProps) {
  const { createShop } = useShop();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Введите название магазина');
      return;
    }
    setLoading(true);
    try {
      let logoUrl: string | undefined;
      if (logoFile) {
        try {
          const uploadResult = await uploadMedia(logoFile, { bucket: 'avatars' });
          logoUrl = uploadResult.url;
        } catch { /* logo upload is non-critical */ }
      }
      await createShop(name.trim(), description.trim(), logoUrl);
      toast.success('Магазин создан!');
      onCreated?.();
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Ошибка создания магазина');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 rounded-t-3xl p-6 pb-safe"
          >
            {/* Handle */}
            <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-5" />

            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">Создать магазин</h2>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Logo upload */}
              <div className="flex justify-center">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-20 h-20 rounded-2xl bg-zinc-800 border-2 border-dashed border-zinc-600 overflow-hidden flex items-center justify-center relative"
                >
                  {logoPreview ? (
                    <img loading="lazy" src={logoPreview} alt="logo" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-zinc-500">
                      <Upload className="w-5 h-5" />
                      <span className="text-xs">Логотип</span>
                    </div>
                  )}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
              </div>

              {/* Name */}
              <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">Название магазина *</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Мой магазин"
                  className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none border border-zinc-700 focus:border-zinc-500 placeholder:text-zinc-600"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">Описание</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Расскажите о своём магазине"
                  rows={3}
                  className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none border border-zinc-700 focus:border-zinc-500 placeholder:text-zinc-600 resize-none"
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={loading || !name.trim()}
                className="w-full flex items-center justify-center gap-2 bg-white text-black font-semibold py-3.5 rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed active:scale-98 transition-transform"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Store className="w-4 h-4" />
                )}
                {loading ? 'Создание...' : 'Создать магазин'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
