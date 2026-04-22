/**
 * CRMInsuranceClientForm — модальная форма создания/редактирования клиента страхового агента.
 * Поля: ФИО, телефон, email, паспорт, дата рождения, адрес, автомобиль, КБМ.
 */
import { useState } from "react";
import { X, Save, User, Phone, Mail, MapPin, Car, FileText, Calendar } from "lucide-react";
import { dbLoose, supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

interface InsuranceClient {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  passport_series: string | null;
  passport_number: string | null;
  birth_date: string | null;
  address: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_plate: string | null;
  vehicle_vin: string | null;
  kbm: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  initial?: Partial<InsuranceClient>;
  onClose: () => void;
  onSaved: (client: InsuranceClient) => void;
}

export function CRMInsuranceClientForm({ initial, onClose, onSaved }: Props) {
  const isEdit = Boolean(initial?.id);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name:             initial?.name             ?? '',
    phone:            initial?.phone            ?? '',
    email:            initial?.email            ?? '',
    passport_series:  initial?.passport_series  ?? '',
    passport_number:  initial?.passport_number  ?? '',
    birth_date:       initial?.birth_date       ?? '',
    address:          initial?.address          ?? '',
    vehicle_make:     initial?.vehicle_make     ?? '',
    vehicle_model:    initial?.vehicle_model    ?? '',
    vehicle_year:     initial?.vehicle_year ? String(initial.vehicle_year) : '',
    vehicle_plate:    initial?.vehicle_plate    ?? '',
    vehicle_vin:      initial?.vehicle_vin      ?? '',
    kbm:              initial?.kbm != null ? String(initial.kbm) : '',
    notes:            initial?.notes            ?? '',
  });

  const set = (field: string, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Укажите ФИО клиента');
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const row = {
        user_id: user.id,
        name: form.name.trim(),
        phone: form.phone || null,
        email: form.email || null,
        passport_series: form.passport_series || null,
        passport_number: form.passport_number || null,
        birth_date: form.birth_date || null,
        address: form.address || null,
        vehicle_make: form.vehicle_make || null,
        vehicle_model: form.vehicle_model || null,
        vehicle_year: form.vehicle_year ? parseInt(form.vehicle_year) : null,
        vehicle_plate: form.vehicle_plate || null,
        vehicle_vin: form.vehicle_vin || null,
        kbm: form.kbm ? parseFloat(form.kbm) : null,
        notes: form.notes || null,
      };

      let saved: InsuranceClient;

      if (isEdit && initial?.id) {
        const { data, error } = await dbLoose
          .from('crm_insurance_clients')
          .update({ ...row, updated_at: new Date().toISOString() })
          .eq('id', initial.id)
          .select()
          .single();
        if (error) throw error;
        saved = data as InsuranceClient;
        toast.success('Клиент обновлён');
      } else {
        const { data, error } = await dbLoose
          .from('crm_insurance_clients')
          .insert(row)
          .select()
          .single();
        if (error) throw error;
        saved = data as InsuranceClient;
        toast.success('Клиент добавлен');
      }

      onSaved(saved);
    } catch (err) {
      toast.error('Ошибка сохранения клиента');
      logger.error('[CRMInsuranceClientForm] submit error', { error: err });
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
            <div className="p-2 bg-emerald-500/20 rounded-lg"><User className="w-4 h-4 text-emerald-400" /></div>
            <h2 className="text-white font-semibold">{isEdit ? 'Редактировать клиента' : 'Новый клиент'}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-700 transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* ФИО */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">ФИО *</label>
            <div className="relative">
              <User className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
              <input
                className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                placeholder="Иванов Иван Иванович"
                value={form.name}
                onChange={e => set('name', e.target.value)}
              />
            </div>
          </div>

          {/* Телефон + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Телефон</label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
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
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  placeholder="email@example.com"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Паспортные данные */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block flex items-center gap-1">
              <FileText className="w-3 h-3" /> Паспортные данные
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                placeholder="Серия (0000)"
                value={form.passport_series}
                onChange={e => set('passport_series', e.target.value)}
                maxLength={4}
              />
              <input
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                placeholder="Номер (000000)"
                value={form.passport_number}
                onChange={e => set('passport_number', e.target.value)}
                maxLength={6}
              />
            </div>
          </div>

          {/* Дата рождения */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Дата рождения
            </label>
            <input
              type="date"
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500"
              value={form.birth_date}
              onChange={e => set('birth_date', e.target.value)}
            />
          </div>

          {/* Адрес регистрации */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Адрес регистрации</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
              <input
                className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                placeholder="г. Москва, ул. Пушкина, д. 1, кв. 1"
                value={form.address}
                onChange={e => set('address', e.target.value)}
              />
            </div>
          </div>

          {/* Разделитель — Автомобиль */}
          <div className="pt-2">
            <p className="text-sm font-medium text-slate-300 flex items-center gap-2 mb-3">
              <Car className="w-4 h-4 text-emerald-400" /> Автомобиль
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Марка</label>
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  placeholder="Toyota"
                  value={form.vehicle_make}
                  onChange={e => set('vehicle_make', e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Модель</label>
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  placeholder="Camry"
                  value={form.vehicle_model}
                  onChange={e => set('vehicle_model', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Год выпуска</label>
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  placeholder="2023"
                  value={form.vehicle_year}
                  onChange={e => set('vehicle_year', e.target.value)}
                  maxLength={4}
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Гос. номер</label>
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 uppercase"
                  placeholder="А777АА77"
                  value={form.vehicle_plate}
                  onChange={e => set('vehicle_plate', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">VIN</label>
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 uppercase"
                  placeholder="JTDKN3DU5A0000000"
                  value={form.vehicle_vin}
                  onChange={e => set('vehicle_vin', e.target.value)}
                  maxLength={17}
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">КБМ (коэффициент)</label>
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  placeholder="0.50"
                  value={form.kbm}
                  onChange={e => set('kbm', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Заметки */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block flex items-center gap-1">
              <FileText className="w-3 h-3" /> Заметки
            </label>
            <textarea
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm resize-none"
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
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Добавить'}
          </button>
        </div>
      </div>
    </div>
  );
}
