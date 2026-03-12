/**
 * CRMClientForm — модальная форма создания/редактирования клиента.
 * Включает: контактные данные, теги, заметки, требования покупателя (недвижимость).
 */
import { useState } from "react";
import { X, Save, User, Phone, Mail, Building2, MapPin, Tag, FileText } from "lucide-react";
import { crm, type CRMClientRecord, type Profession } from "@/lib/crm";
import { toast } from "sonner";

interface Props {
  profession: Profession;
  initial?: Partial<CRMClientRecord>;
  onClose: () => void;
  onSaved: (client: CRMClientRecord) => void;
}

const CLIENT_TYPES_REALESTATE = ['Покупатель', 'Арендатор', 'Продавец', 'Арендодатель', 'Застройщик'];
const LEAD_SOURCES_RE = ['ЦИАН', 'Авито', 'ДомКлик', 'Яндекс.Недвижимость', 'Рекомендация', 'Соцсети', 'Сайт', 'Холодный звонок', 'Другое'];

export function CRMClientForm({ profession, initial, onClose, onSaved }: Props) {
  const isEdit = Boolean(initial?.id);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name:     initial?.name     ?? '',
    phone:    initial?.phone    ?? '',
    email:    initial?.email    ?? '',
    company:  initial?.company  ?? '',
    position: initial?.position ?? '',
    address:  initial?.address  ?? '',
    notes:    initial?.notes    ?? '',
    tags:     initial?.tags     ?? [] as string[],
  });

  const [tagInput, setTagInput] = useState('');

  const set = (field: string, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const addTag = (tag: string) => {
    const t = tag.trim();
    if (t && !form.tags.includes(t)) {
      setForm(prev => ({ ...prev, tags: [...prev.tags, t] }));
    }
    setTagInput('');
  };

  const removeTag = (tag: string) =>
    setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Укажите имя клиента');
      return;
    }
    setSaving(true);
    try {
      let saved: CRMClientRecord;
      if (isEdit && initial?.id) {
        saved = await crm.updateClient(initial.id, form);
      } else {
        saved = await crm.createClient({ ...form, profession });
      }
      toast.success(isEdit ? 'Клиент обновлён' : 'Клиент добавлен');
      onSaved(saved);
    } catch (err) {
      toast.error('Ошибка сохранения клиента');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg"><User className="w-4 h-4 text-blue-400" /></div>
            <h2 className="text-white font-semibold">{isEdit ? 'Редактировать клиента' : 'Новый клиент'}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-700 transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Name */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Имя / Компания *</label>
            <div className="relative">
              <User className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
              <input
                className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                placeholder="Иванов Иван Иванович"
                value={form.name}
                onChange={e => set('name', e.target.value)}
              />
            </div>
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Телефон</label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  placeholder="+7 999 000-00-00"
                  value={form.phone}
                  onChange={e => set('phone', e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  placeholder="email@example.com"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Company + Position */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Компания</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  placeholder="ООО Ромашка"
                  value={form.company}
                  onChange={e => set('company', e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Должность</label>
              <input
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                placeholder="директор"
                value={form.position}
                onChange={e => set('position', e.target.value)}
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Адрес</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
              <input
                className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                placeholder="Москва, ул. Пушкина 1"
                value={form.address}
                onChange={e => set('address', e.target.value)}
              />
            </div>
          </div>

          {/* Quick tags for RE */}
          {profession === 'realestate' && (
            <div>
              <label className="text-xs text-slate-400 mb-2 block">Тип клиента</label>
              <div className="flex flex-wrap gap-2">
                {CLIENT_TYPES_REALESTATE.map(t => (
                  <button
                    key={t}
                    onClick={() => form.tags.includes(t) ? removeTag(t) : addTag(t)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      form.tags.includes(t)
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <label className="text-xs text-slate-400 mb-2 mt-3 block">Источник</label>
              <div className="flex flex-wrap gap-2">
                {LEAD_SOURCES_RE.map(s => (
                  <button
                    key={s}
                    onClick={() => form.tags.includes(s) ? removeTag(s) : addTag(s)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      form.tags.includes(s)
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom tags */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block flex items-center gap-1">
              <Tag className="w-3 h-3" /> Произвольные теги
            </label>
            <div className="flex gap-2 mb-2">
              <input
                className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                placeholder="Добавить тег..."
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } }}
              />
              <button
                onClick={() => addTag(tagInput)}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-sm"
              >
                +
              </button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {form.tags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-700 text-slate-300 rounded-full text-xs">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:text-red-400"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block flex items-center gap-1">
              <FileText className="w-3 h-3" /> Заметки
            </label>
            <textarea
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm resize-none"
              rows={3}
              placeholder="Дополнительная информация о клиенте..."
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-slate-900/95 backdrop-blur-sm p-4 border-t border-slate-700 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition-colors">
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Добавить'}
          </button>
        </div>
      </div>
    </div>
  );
}
