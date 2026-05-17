/**
 * ProductFormDialog — диалог создания/редактирования товара маркетплейса.
 *
 * Используется на странице MarketplaceProductsPage.
 * Содержит форму для заполнения полей CreateMarketplaceProductInput:
 *  - connection_id (select)
 *  - marketplace_sku
 *  - title
 *  - price / old_price / currency
 *  - images (url-список, строка)
 *  - description
 *  - barcode
 *  - category_id
 *  - attributes (json строка)
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useMarketplace } from '@/hooks/useMarketplace';
import type { CreateMarketplaceProductInput } from '@/lib/marketplace/marketplaceApi';

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingProduct?: { id: string } & Partial<CreateMarketplaceProductInput> | null;
  onSaved?: () => void;
}

const EMPTY_FORM: CreateMarketplaceProductInput = {
  connection_id: '',
  marketplace_sku: '',
  title: '',
  description: '',
  price: 0,
  old_price: undefined,
  currency: 'RUB',
  barcode: '',
  images: [],
  category_id: '',
  attributes: {},
  vat: 20,
  weight_kg: undefined,
  dimensions: undefined,
};

export function ProductFormDialog({ open, onOpenChange, editingProduct, onSaved }: ProductFormDialogProps) {
  const { connections, addProductToMarketplace, updateMarketplaceProduct } = useMarketplace();

  const isEdit = !!editingProduct?.id;
  const [form, setForm] = useState<CreateMarketplaceProductInput>({ ...EMPTY_FORM });
  const [imageInput, setImageInput] = useState('');
  const [newAttrKey, setNewAttrKey] = useState('');
  const [newAttrValue, setNewAttrValue] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Инициализация формы при открытии ────────────────────────────────────────
  useEffect(() => {
    if (open) {
      if (isEdit && editingProduct) {
        setForm({
          connection_id: editingProduct.connection_id ?? '',
          marketplace_sku: editingProduct.marketplace_sku ?? '',
          title: editingProduct.title ?? '',
          description: editingProduct.description ?? '',
          price: editingProduct.price ?? 0,
          old_price: editingProduct.old_price,
          currency: editingProduct.currency ?? 'RUB',
          barcode: editingProduct.barcode ?? '',
          images: editingProduct.images ?? [],
          category_id: editingProduct.category_id ?? '',
          attributes: editingProduct.attributes ?? {},
          vat: editingProduct.vat ?? 20,
          weight_kg: editingProduct.weight_kg,
          dimensions: editingProduct.dimensions,
        });
      } else {
        setForm({ ...EMPTY_FORM });
      }
      setImageInput('');
      setNewAttrKey('');
      setNewAttrValue('');
    }
  }, [open, isEdit, editingProduct]);

  // ── Обновление поля формы ───────────────────────────────────────────────────
  const set = useCallback(<K extends keyof CreateMarketplaceProductInput>(key: K, value: CreateMarketplaceProductInput[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  // ── Добавить изображение ─────────────────────────────────────────────────────
  const addImage = useCallback(() => {
    const url = imageInput.trim();
    if (!url) return;
    setForm(prev => ({ ...prev, images: [...prev.images, url] }));
    setImageInput('');
  }, [imageInput]);

  const removeImage = useCallback((idx: number) => {
    setForm(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== idx) }));
  }, []);

  // ── Добавить атрибут ─────────────────────────────────────────────────────────
  const addAttr = useCallback(() => {
    const key = newAttrKey.trim();
    const value = newAttrValue.trim();
    if (!key) return;
    setForm(prev => ({ ...prev, attributes: { ...prev.attributes, [key]: value } }));
    setNewAttrKey('');
    setNewAttrValue('');
  }, [newAttrKey, newAttrValue]);

  const removeAttr = useCallback((key: string) => {
    setForm(prev => {
      const copy = { ...prev.attributes };
      delete copy[key];
      return { ...prev, attributes: copy };
    });
  }, []);

  // ── Сохранение ───────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!form.connection_id) { toast.error('Выберите подключение к маркетплейсу'); return; }
    if (!form.marketplace_sku.trim()) { toast.error('Введите SKU товара'); return; }
    if (!form.title.trim()) { toast.error('Введите название товара'); return; }
    if (!form.price || form.price <= 0) { toast.error('Введите цену'); return; }
    if (form.images.length === 0) { toast.error('Добавьте хотя бы одно изображение (URL)'); return; }

    setSaving(true);
    try {
      if (isEdit && editingProduct?.id) {
        await updateMarketplaceProduct(editingProduct.id, form);
        toast.success('Товар обновлён');
      } else {
        await addProductToMarketplace(form);
        toast.success('Товар создан');
      }
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Ошибка сохранения: ' + e.message);
    } finally {
      setSaving(false);
    }
  }, [form, isEdit, editingProduct, addProductToMarketplace, updateMarketplaceProduct, onSaved, onOpenChange]);

  // ── Рендер ───────────────────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => onOpenChange(false)}
        >
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-2xl sm:rounded-t-3xl bg-zinc-900 border border-zinc-800 sm:my-8 sm:mx-4 max-h-[90vh] overflow-y-auto rounded-t-2xl"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="font-bold text-lg text-white">
                {isEdit ? 'Редактировать товар' : 'Новый товар'}
              </h2>
              <button onClick={() => onOpenChange(false)} className="p-2 hover:bg-zinc-800 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <div className="p-4 space-y-4">
              {/* Подключение */}
              <div>
                <label className="text-zinc-400 text-xs mb-1 block uppercase tracking-wide">Маркетплейс *</label>
                <select
                  value={form.connection_id}
                  onChange={e => set('connection_id', e.target.value)}
                  className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Выберите платформу</option>
                  {connections.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.marketplace_type.toUpperCase()} — {c.seller_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* SKU + Название */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 text-xs mb-1 block uppercase tracking-wide">SKU *</label>
                  <input
                    type="text"
                    value={form.marketplace_sku}
                    onChange={e => set('marketplace_sku', e.target.value)}
                    placeholder="ART-001"
                    className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs mb-1 block uppercase tracking-wide">Название *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => set('title', e.target.value)}
                    placeholder="Название товара"
                    className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Цена */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-zinc-400 text-xs mb-1 block uppercase tracking-wide">Цена *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price || ''}
                    onChange={e => set('price', parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs mb-1 block uppercase tracking-wide">Старая цена</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.old_price ?? ''}
                    onChange={e => set('old_price', parseFloat(e.target.value) || undefined)}
                    placeholder="0"
                    className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs mb-1 block uppercase tracking-wide">Валюта</label>
                  <select
                    value={form.currency ?? 'RUB'}
                    onChange={e => set('currency', e.target.value)}
                    className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="RUB">RUB ₽</option>
                    <option value="USD">USD $</option>
                    <option value="EUR">EUR €</option>
                  </select>
                </div>
              </div>

              {/* Изображения */}
              <div>
                <label className="text-zinc-400 text-xs mb-1 block uppercase tracking-wide">Изображения (URL) *</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={imageInput}
                    onChange={e => setImageInput(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addImage())}
                    className="flex-1 bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={addImage}
                    className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                {form.images.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {form.images.map((url, i) => (
                      <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden bg-zinc-800">
                        <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                        <button
                          onClick={() => removeImage(i)}
                          className="absolute top-0.5 right-0.5 p-1 bg-red-500/80 hover:bg-red-500 rounded-full"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Описание */}
              <div>
                <label className="text-zinc-400 text-xs mb-1 block uppercase tracking-wide">Описание</label>
                <textarea
                  value={form.description ?? ''}
                  onChange={e => set('description', e.target.value)}
                  rows={3}
                  placeholder="Описание товара..."
                  className="w-full bg-zinc-800 text-white placeholder-zinc-600 rounded-xl p-3 text-sm resize-none outline-none border border-zinc-800 focus:border-blue-500"
                />
              </div>

              {/* Штрихкод / категория */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 text-xs mb-1 block uppercase tracking-wide">Штрихкод</label>
                  <input
                    type="text"
                    value={form.barcode ?? ''}
                    onChange={e => set('barcode', e.target.value)}
                    placeholder="4601234567890"
                    className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs mb-1 block uppercase tracking-wide">Категория ID</label>
                  <input
                    type="text"
                    value={form.category_id ?? ''}
                    onChange={e => set('category_id', e.target.value)}
                    placeholder="cat-001"
                    className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Атрибуты */}
              <div>
                <label className="text-zinc-400 text-xs mb-1 block uppercase tracking-wide">Атрибуты (ключ: значение)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newAttrKey}
                    onChange={e => setNewAttrKey(e.target.value)}
                    placeholder="Ключ (например: Цвет)"
                    className="flex-1 bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    value={newAttrValue}
                    onChange={e => setNewAttrValue(e.target.value)}
                    placeholder="Значение"
                    className="w-32 bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addAttr())}
                  />
                  <button
                    onClick={addAttr}
                    className="px-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                {Object.keys(form.attributes ?? {}).length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {Object.entries(form.attributes!).map(([k, v]) => (
                      <span key={k} className="inline-flex items-center gap-1 px-3 py-1 bg-zinc-800 rounded-full text-xs">
                        {k}: {String(v)}
                        <button onClick={() => removeAttr(k)} className="hover:text-red-400 transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Вес / габариты */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-1">
                  <label className="text-zinc-400 text-xs mb-1 block uppercase tracking-wide">Вес (кг)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.weight_kg ?? ''}
                    onChange={e => set('weight_kg', parseFloat(e.target.value) || undefined)}
                    placeholder="0.5"
                    className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs mb-1 block uppercase tracking-wide">Длина</label>
                  <input
                    type="number"
                    min="0"
                    value={form.dimensions?.length ?? ''}
                    onChange={e => set('dimensions', { length: parseFloat(e.target.value) || 0, width: form.dimensions?.width ?? 0, height: form.dimensions?.height ?? 0 })}
                    placeholder="см"
                    className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs mb-1 block uppercase tracking-wide">Ширина</label>
                  <input
                    type="number"
                    min="0"
                    value={form.dimensions?.width ?? ''}
                    onChange={e => set('dimensions', { length: form.dimensions?.length ?? 0, width: parseFloat(e.target.value) || 0, height: form.dimensions?.height ?? 0 })}
                    placeholder="см"
                    className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs mb-1 block uppercase tracking-wide">Высота</label>
                  <input
                    type="number"
                    min="0"
                    value={form.dimensions?.height ?? ''}
                    onChange={e => set('dimensions', { length: form.dimensions?.length ?? 0, width: form.dimensions?.width ?? 0, height: parseFloat(e.target.value) || 0 })}
                    placeholder="см"
                    className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white py-4 rounded-2xl font-semibold text-base active:scale-[0.98] transition-transform"
              >
                {saving && <Loader2 className="w-5 h-5 animate-spin" />}
                {saving ? 'Сохраняем…' : isEdit ? 'Сохранить изменения' : 'Создать товар'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
