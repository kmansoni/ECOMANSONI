/**
 * CRMDealForm — модальная форма создания/редактирования сделки.
 * Поддерживает: недвижимость (тип сделки продажа/аренда, объект, ипотека, комиссия),
 * универсальная воронка, источники лидов.
 */
import { useState, useEffect } from "react";
import { X, Save, Briefcase, DollarSign, Calendar, Target, Home, CreditCard, TrendingUp } from "lucide-react";
import { crm, type CRMDeal, type CRMClientRecord, type CRMProperty, type Profession, DEAL_SOURCES } from "@/lib/crm";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

const RE_STAGES = [
  { value: 'new',         label: 'Новая заявка' },
  { value: 'contacted',   label: 'Первичный контакт' },
  { value: 'qualified',   label: 'Квалификация' },
  { value: 'viewing',     label: 'Просмотр(ы)' },
  { value: 'negotiation', label: 'Переговоры' },
  { value: 'contract',    label: 'Договор' },
  { value: 'won',         label: 'Сделка закрыта ✓' },
  { value: 'lost',        label: 'Отказ ✗' },
];

const DEFAULT_STAGES = [
  { value: 'new',         label: 'Новый' },
  { value: 'contacted',   label: 'Контакт' },
  { value: 'qualified',   label: 'Квалификация' },
  { value: 'proposal',    label: 'Предложение' },
  { value: 'negotiation', label: 'Переговоры' },
  { value: 'won',         label: 'Выиграно ✓' },
  { value: 'lost',        label: 'Проиграно ✗' },
];

interface Props {
  profession: Profession;
  initial?: Partial<CRMDeal>;
  clientId?: string;
  onClose: () => void;
  onSaved: (deal: CRMDeal) => void;
}

export function CRMDealForm({ profession, initial, clientId, onClose, onSaved }: Props) {
  const isEdit = Boolean(initial?.id);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<CRMClientRecord[]>([]);
  const [properties, setProperties] = useState<CRMProperty[]>([]);

  const stages = profession === 'realestate' ? RE_STAGES : DEFAULT_STAGES;

  const [form, setForm] = useState({
    title:               initial?.title               ?? '',
    description:         initial?.description         ?? '',
    value:               String(initial?.value        ?? ''),
    currency:            initial?.currency            ?? 'RUB',
    stage:               initial?.stage               ?? 'new',
    probability:         String(initial?.probability  ?? '50'),
    expected_close_date: initial?.expected_close_date ?? '',
    client_id:           initial?.client_id           ?? clientId ?? '',
    source:              (initial?.custom_fields?.source ?? 'direct') as string,
    lost_reason:         initial?.lost_reason         ?? '',
    // RE specific (stored in custom_fields)
    property_id:         String(initial?.custom_fields?.property_id ?? ''),
    deal_re_type:        String(initial?.custom_fields?.deal_re_type ?? 'sale'),
    mortgage:            Boolean(initial?.custom_fields?.mortgage ?? false),
    mortgage_bank:       String(initial?.custom_fields?.mortgage_bank ?? ''),
    commission_percent:  String(initial?.custom_fields?.commission_percent ?? ''),
  });

  useEffect(() => {
    crm.getClients().then(setClients).catch(console.error);
    if (profession === 'realestate') {
      crm.getProperties().then(setProperties).catch(console.error);
    }
  }, [profession]);

  const set = (field: string, value: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const commissionAmount = (): number => {
    const v = parseFloat(form.value);
    const p = parseFloat(form.commission_percent);
    if (isNaN(v) || isNaN(p)) return 0;
    return Math.round(v * p / 100);
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) { toast.error('Укажите название сделки'); return; }
    setSaving(true);
    try {
      const custom_fields: Record<string, unknown> = {
        source: form.source,
      };
      if (profession === 'realestate') {
        custom_fields.deal_re_type       = form.deal_re_type;
        custom_fields.mortgage           = form.mortgage;
        custom_fields.mortgage_bank      = form.mortgage_bank;
        custom_fields.commission_percent = form.commission_percent;
        custom_fields.commission_amount  = commissionAmount();
        if (form.property_id) custom_fields.property_id = form.property_id;
      }

      const payload: Partial<CRMDeal> = {
        title:               form.title,
        description:         form.description || null,
        value:               parseFloat(form.value) || 0,
        currency:            form.currency,
        stage:               form.stage,
        probability:         parseInt(form.probability) || 50,
        expected_close_date: form.expected_close_date || null,
        client_id:           form.client_id || null,
        won:                 form.stage === 'won',
        lost:                form.stage === 'lost',
        lost_reason:         form.lost_reason || null,
        custom_fields,
      };

      let saved: CRMDeal;
      if (isEdit && initial?.id) {
        saved = await crm.updateDeal(initial.id, payload);
      } else {
        saved = await crm.createDeal({ ...payload, profession });
      }
      toast.success(isEdit ? 'Сделка обновлена' : 'Сделка создана');
      onSaved(saved);
    } catch (err) {
      toast.error('Ошибка сохранения сделки');
      logger.error('[CRMDealForm] submit error', { error: err });
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
            <div className="p-2 bg-green-500/20 rounded-lg"><Briefcase className="w-4 h-4 text-green-400" /></div>
            <h2 className="text-white font-semibold">{isEdit ? 'Редактировать сделку' : 'Новая сделка'}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-700">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Название сделки *</label>
            <input
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              placeholder="Продажа 2-к квартиры на Тверской"
              value={form.title}
              onChange={e => set('title', e.target.value)}
            />
          </div>

          {/* Client */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Клиент</label>
            <select
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-blue-500"
              value={form.client_id}
              onChange={e => set('client_id', e.target.value)}
            >
              <option value="">— выберите клиента —</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ''}</option>
              ))}
            </select>
          </div>

          {/* Stage */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block flex items-center gap-1">
              <Target className="w-3 h-3" /> Стадия
            </label>
            <div className="grid grid-cols-2 gap-2">
              {stages.map(s => (
                <button
                  key={s.value}
                  onClick={() => set('stage', s.value)}
                  className={`py-2 px-3 rounded-xl text-sm text-left transition-colors ${
                    form.stage === s.value
                      ? s.value === 'won' ? 'bg-green-600 text-white'
                        : s.value === 'lost' ? 'bg-red-600 text-white'
                        : 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Lost reason */}
          {form.stage === 'lost' && (
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Причина отказа</label>
              <input
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                placeholder="Выбрал другой объект, высокая цена..."
                value={form.lost_reason}
                onChange={e => set('lost_reason', e.target.value)}
              />
            </div>
          )}

          {/* Value */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> Сумма (₽)
              </label>
              <input
                type="number"
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                placeholder="15000000"
                value={form.value}
                onChange={e => set('value', e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Вероятность %
              </label>
              <input
                type="number"
                min="0" max="100"
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                value={form.probability}
                onChange={e => set('probability', e.target.value)}
              />
            </div>
          </div>

          {/* Close date + Source */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Дата закрытия
              </label>
              <input
                type="date"
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-blue-500"
                value={form.expected_close_date}
                onChange={e => set('expected_close_date', e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Источник</label>
              <select
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-blue-500"
                value={form.source}
                onChange={e => set('source', e.target.value)}
              >
                {DEAL_SOURCES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Real Estate specific */}
          {profession === 'realestate' && (
            <>
              <div className="border-t border-slate-700 pt-4">
                <p className="text-xs text-slate-400 mb-3 flex items-center gap-1">
                  <Home className="w-3 h-3" /> Параметры недвижимости
                </p>
                {/* RE deal type */}
                <div className="flex gap-2 mb-3">
                  {[{v:'sale',l:'Продажа'},{v:'rent',l:'Аренда'}].map(t => (
                    <button
                      key={t.v}
                      onClick={() => set('deal_re_type', t.v)}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                        form.deal_re_type === t.v ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {t.l}
                    </button>
                  ))}
                </div>

                {/* Property select */}
                {properties.length > 0 && (
                  <div className="mb-3">
                    <label className="text-xs text-slate-400 mb-1 block">Объект недвижимости</label>
                    <select
                      className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-blue-500"
                      value={form.property_id}
                      onChange={e => set('property_id', e.target.value)}
                    >
                      <option value="">— выберите объект —</option>
                      {properties.filter(p => p.status === 'available').map(p => (
                        <option key={p.id} value={p.id}>
                          {p.title} {p.price ? `— ${p.price.toLocaleString()} ₽` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Commission */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Комиссия %</label>
                    <input
                      type="number"
                      min="0" max="100" step="0.1"
                      className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      placeholder="3.5"
                      value={form.commission_percent}
                      onChange={e => set('commission_percent', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Комиссия ₽</label>
                    <div className="bg-slate-700 border border-slate-600 rounded-xl px-3 py-2.5 text-green-400 font-medium text-sm">
                      {commissionAmount() > 0 ? `${commissionAmount().toLocaleString()} ₽` : '—'}
                    </div>
                  </div>
                </div>

                {/* Mortgage */}
                <div className="flex items-center gap-3 p-3 bg-slate-800 rounded-xl">
                  <CreditCard className="w-4 h-4 text-slate-400" />
                  <div className="flex-1">
                    <p className="text-sm text-white">Ипотека</p>
                    {form.mortgage && (
                      <input
                        className="mt-1 w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-white text-sm placeholder-slate-500 focus:outline-none"
                        placeholder="Банк (Сбер, ВТБ, Альфа...)"
                        value={form.mortgage_bank}
                        onChange={e => set('mortgage_bank', e.target.value)}
                      />
                    )}
                  </div>
                  <button
                    onClick={() => set('mortgage', !form.mortgage)}
                    className={`w-10 h-6 rounded-full transition-colors ${form.mortgage ? 'bg-blue-600' : 'bg-slate-600'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full transition-transform mx-1 ${form.mortgage ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Description */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Описание / Комментарий</label>
            <textarea
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm resize-none"
              rows={2}
              placeholder="Детали сделки..."
              value={form.description}
              onChange={e => set('description', e.target.value)}
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
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
}
