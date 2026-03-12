/**
 * CRMPropertyForm — форма объекта недвижимости.
 * Реализует полный каталог: тип объекта, адрес, площадь, этаж, цена,
 * характеристики дома, данные собственника, эксклюзив, комиссия.
 * Уровень: TopN Lab / ЦИАН Agent / Bitrix24 Real Estate.
 */
import { useState } from "react";
import { X, Save, Home, MapPin, Layers, DollarSign, User, Star, CheckSquare } from "lucide-react";
import { crm, type CRMProperty, PROPERTY_FEATURES } from "@/lib/crm";
import { toast } from "sonner";

const PROPERTY_TYPES = [
  { value: 'apartment', label: 'Квартира' },
  { value: 'room',      label: 'Комната' },
  { value: 'house',     label: 'Дом' },
  { value: 'townhouse', label: 'Таунхаус' },
  { value: 'commercial',label: 'Коммерция' },
  { value: 'land',      label: 'Участок' },
  { value: 'garage',    label: 'Гараж' },
  { value: 'parking',   label: 'Парковка' },
];

const CONDITIONS = ['Новостройка', 'Вторичка', 'Отличное', 'Хорошее', 'Требует ремонта', 'Дизайнерский ремонт', 'Евроремонт'];
const BUILDING_TYPES = ['Панельный', 'Кирпичный', 'Монолитный', 'Монолит-кирпич', 'Блочный', 'Деревянный'];

interface Props {
  initial?: Partial<CRMProperty>;
  onClose: () => void;
  onSaved: (property: CRMProperty) => void;
}

export function CRMPropertyForm({ initial, onClose, onSaved }: Props) {
  const isEdit = Boolean(initial?.id);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<'main'|'params'|'price'|'owner'>('main');

  const [form, setForm] = useState({
    title:              initial?.title              ?? '',
    deal_type:          initial?.deal_type          ?? 'sale',
    property_type:      initial?.property_type      ?? 'apartment',
    status:             initial?.status             ?? 'available',
    address:            initial?.address            ?? '',
    district:           initial?.district           ?? '',
    city:               initial?.city               ?? 'Москва',
    metro_station:      initial?.metro_station      ?? '',
    metro_minutes:      String(initial?.metro_minutes ?? ''),
    area_total:         String(initial?.area_total  ?? ''),
    area_living:        String(initial?.area_living ?? ''),
    area_kitchen:       String(initial?.area_kitchen ?? ''),
    rooms:              String(initial?.rooms       ?? ''),
    floor:              String(initial?.floor       ?? ''),
    floors_total:       String(initial?.floors_total ?? ''),
    building_year:      String(initial?.building_year ?? ''),
    building_type:      initial?.building_type      ?? '',
    condition:          initial?.condition          ?? '',
    price:              String(initial?.price       ?? ''),
    price_negotiable:   initial?.price_negotiable   ?? false,
    commission_percent: String(initial?.commission_percent ?? ''),
    commission_shared:  initial?.commission_shared  ?? false,
    owner_name:         initial?.owner_name         ?? '',
    owner_phone:        initial?.owner_phone        ?? '',
    exclusive:          initial?.exclusive          ?? false,
    description:        initial?.description        ?? '',
    features:           initial?.features           ?? [] as string[],
  });

  const set = (field: string, value: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const toggleFeature = (f: string) =>
    setForm(prev => ({
      ...prev,
      features: prev.features.includes(f)
        ? prev.features.filter(x => x !== f)
        : [...prev.features, f],
    }));

  const pricePerSqm = (): number => {
    const p = parseFloat(form.price);
    const a = parseFloat(form.area_total);
    if (!p || !a) return 0;
    return Math.round(p / a);
  };

  const commissionAmount = (): number => {
    const p = parseFloat(form.price);
    const c = parseFloat(form.commission_percent);
    if (!p || !c) return 0;
    return Math.round(p * c / 100);
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) { toast.error('Укажите название объекта'); return; }
    setSaving(true);
    try {
      const payload: Partial<CRMProperty> = {
        title:              form.title,
        deal_type:          form.deal_type as CRMProperty['deal_type'],
        property_type:      form.property_type as CRMProperty['property_type'],
        status:             form.status as CRMProperty['status'],
        address:            form.address || null,
        district:           form.district || null,
        city:               form.city || 'Москва',
        metro_station:      form.metro_station || null,
        metro_minutes:      parseInt(form.metro_minutes) || null,
        area_total:         parseFloat(form.area_total) || null,
        area_living:        parseFloat(form.area_living) || null,
        area_kitchen:       parseFloat(form.area_kitchen) || null,
        rooms:              parseInt(form.rooms) || null,
        floor:              parseInt(form.floor) || null,
        floors_total:       parseInt(form.floors_total) || null,
        building_year:      parseInt(form.building_year) || null,
        building_type:      form.building_type || null,
        condition:          form.condition || null,
        price:              parseFloat(form.price) || null,
        price_negotiable:   form.price_negotiable,
        commission_percent: parseFloat(form.commission_percent) || null,
        commission_shared:  form.commission_shared,
        owner_name:         form.owner_name || null,
        owner_phone:        form.owner_phone || null,
        exclusive:          form.exclusive,
        description:        form.description || null,
        features:           form.features,
      };

      let saved: CRMProperty;
      if (isEdit && initial?.id) {
        saved = await crm.updateProperty(initial.id, payload);
      } else {
        saved = await crm.createProperty(payload);
      }
      toast.success(isEdit ? 'Объект обновлён' : 'Объект добавлен');
      onSaved(saved);
    } catch (err) {
      toast.error('Ошибка сохранения объекта');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const SECTIONS = [
    { id: 'main',   label: 'Основное' },
    { id: 'params', label: 'Параметры' },
    { id: 'price',  label: 'Цена' },
    { id: 'owner',  label: 'Собственник' },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/20 rounded-lg"><Home className="w-4 h-4 text-orange-400" /></div>
            <h2 className="text-white font-semibold">{isEdit ? 'Редактировать объект' : 'Новый объект'}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-700">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Section tabs */}
        <div className="flex px-4 gap-1 overflow-x-auto border-b border-slate-700 bg-slate-900">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${
                activeSection === s.id
                  ? 'border-orange-500 text-orange-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* MAIN tab */}
          {activeSection === 'main' && (
            <>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Название объекта *</label>
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                  placeholder="2-к квартира, Тверская 15, 45 м²"
                  value={form.title}
                  onChange={e => set('title', e.target.value)}
                />
              </div>

              {/* Deal type */}
              <div>
                <label className="text-xs text-slate-400 mb-2 block">Тип сделки</label>
                <div className="flex gap-2">
                  {[{v:'sale',l:'Продажа'},{v:'rent',l:'Аренда'},{v:'sale_rent',l:'Продажа/Аренда'}].map(t => (
                    <button key={t.v} onClick={() => set('deal_type', t.v)}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                        form.deal_type === t.v ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                      {t.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Property type */}
              <div>
                <label className="text-xs text-slate-400 mb-2 block">Тип недвижимости</label>
                <div className="grid grid-cols-4 gap-2">
                  {PROPERTY_TYPES.map(t => (
                    <button key={t.value} onClick={() => set('property_type', t.value)}
                      className={`py-2 px-1 rounded-xl text-xs text-center transition-colors ${
                        form.property_type === t.value ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="text-xs text-slate-400 mb-2 block">Статус</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    {v:'available',l:'Свободен',c:'green'},
                    {v:'reserved',l:'Резерв',c:'yellow'},
                    {v:'sold',l:'Продан',c:'red'},
                    {v:'rented',l:'Сдан',c:'purple'},
                    {v:'off_market',l:'Снят',c:'gray'},
                  ].map(s => (
                    <button key={s.v} onClick={() => set('status', s.v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        form.status === s.v ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                      {s.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Адрес
                </label>
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 mb-2"
                  placeholder="ул. Тверская, д. 15, кв. 32"
                  value={form.address}
                  onChange={e => set('address', e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm"
                    placeholder="Район"
                    value={form.district}
                    onChange={e => set('district', e.target.value)}
                  />
                  <input
                    className="bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm"
                    placeholder="Город"
                    value={form.city}
                    onChange={e => set('city', e.target.value)}
                  />
                </div>
              </div>

              {/* Metro */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Метро</label>
                  <input
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm"
                    placeholder="Пушкинская"
                    value={form.metro_station}
                    onChange={e => set('metro_station', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Мин. пешком</label>
                  <input type="number"
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm"
                    placeholder="10"
                    value={form.metro_minutes}
                    onChange={e => set('metro_minutes', e.target.value)}
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Описание</label>
                <textarea
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm resize-none"
                  rows={3}
                  placeholder="Описание объекта, особенности, детали..."
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                />
              </div>
            </>
          )}

          {/* PARAMS tab */}
          {activeSection === 'params' && (
            <>
              <div>
                <label className="text-xs text-slate-400 mb-2 block flex items-center gap-1">
                  <Layers className="w-3 h-3" /> Площадь (кв.м.)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Общая</label>
                    <input type="number"
                      className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm"
                      placeholder="54.5"
                      value={form.area_total}
                      onChange={e => set('area_total', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Жилая</label>
                    <input type="number"
                      className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm"
                      placeholder="32"
                      value={form.area_living}
                      onChange={e => set('area_living', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Кухня</label>
                    <input type="number"
                      className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm"
                      placeholder="10"
                      value={form.area_kitchen}
                      onChange={e => set('area_kitchen', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Комнат</label>
                  <div className="flex gap-1 flex-wrap">
                    {['Студия','1','2','3','4','5+'].map((r,i) => (
                      <button key={r}
                        onClick={() => set('rooms', i === 0 ? '0' : r)}
                        className={`px-2 py-1 rounded-lg text-xs transition-colors ${
                          form.rooms === (i === 0 ? '0' : r) ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Этаж</label>
                  <input type="number"
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-orange-500"
                    placeholder="5"
                    value={form.floor}
                    onChange={e => set('floor', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Этажей в доме</label>
                  <input type="number"
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-orange-500"
                    placeholder="16"
                    value={form.floors_total}
                    onChange={e => set('floors_total', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Год постройки</label>
                  <input type="number"
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-orange-500"
                    placeholder="2005"
                    value={form.building_year}
                    onChange={e => set('building_year', e.target.value)}
                  />
                </div>
              </div>

              {/* Building type */}
              <div>
                <label className="text-xs text-slate-400 mb-2 block">Тип дома</label>
                <div className="flex flex-wrap gap-2">
                  {BUILDING_TYPES.map(b => (
                    <button key={b} onClick={() => set('building_type', form.building_type === b ? '' : b)}
                      className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        form.building_type === b ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              {/* Condition */}
              <div>
                <label className="text-xs text-slate-400 mb-2 block">Состояние</label>
                <div className="flex flex-wrap gap-2">
                  {CONDITIONS.map(c => (
                    <button key={c} onClick={() => set('condition', form.condition === c ? '' : c)}
                      className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        form.condition === c ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Features */}
              <div>
                <label className="text-xs text-slate-400 mb-2 block flex items-center gap-1">
                  <CheckSquare className="w-3 h-3" /> Характеристики
                </label>
                <div className="flex flex-wrap gap-2">
                  {PROPERTY_FEATURES.map(f => (
                    <button key={f} onClick={() => toggleFeature(f)}
                      className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        form.features.includes(f) ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* PRICE tab */}
          {activeSection === 'price' && (
            <>
              <div>
                <label className="text-xs text-slate-400 mb-1 block flex items-center gap-1">
                  <DollarSign className="w-3 h-3" /> Цена (₽)
                </label>
                <input type="number"
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-lg font-semibold placeholder-slate-500 focus:outline-none focus:border-orange-500"
                  placeholder="15 000 000"
                  value={form.price}
                  onChange={e => set('price', e.target.value)}
                />
                {pricePerSqm() > 0 && (
                  <p className="text-xs text-slate-400 mt-1">{pricePerSqm().toLocaleString()} ₽/м²</p>
                )}
              </div>

              <div className="flex items-center gap-3 p-3 bg-slate-800 rounded-xl">
                <span className="text-sm text-slate-300 flex-1">Торг возможен</span>
                <button onClick={() => set('price_negotiable', !form.price_negotiable)}
                  className={`w-10 h-6 rounded-full transition-colors ${form.price_negotiable ? 'bg-orange-500' : 'bg-slate-600'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform mx-1 ${form.price_negotiable ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>

              <div className="border-t border-slate-700 pt-4">
                <p className="text-xs text-slate-400 mb-3">💼 Комиссия агента</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Процент</label>
                    <input type="number" min="0" max="100" step="0.1"
                      className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-orange-500"
                      placeholder="3.5"
                      value={form.commission_percent}
                      onChange={e => set('commission_percent', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Сумма ₽</label>
                    <div className="bg-slate-700 border border-slate-600 rounded-xl px-3 py-2.5 text-green-400 font-medium">
                      {commissionAmount() > 0 ? `${commissionAmount().toLocaleString()} ₽` : '—'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-slate-800 rounded-xl mt-3">
                  <span className="text-sm text-slate-300 flex-1">Комиссия пополам (со вторым агентом)</span>
                  <button onClick={() => set('commission_shared', !form.commission_shared)}
                    className={`w-10 h-6 rounded-full transition-colors ${form.commission_shared ? 'bg-orange-500' : 'bg-slate-600'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full transition-transform mx-1 ${form.commission_shared ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
            </>
          )}

          {/* OWNER tab */}
          {activeSection === 'owner' && (
            <>
              <div>
                <label className="text-xs text-slate-400 mb-1 block flex items-center gap-1">
                  <User className="w-3 h-3" /> Собственник
                </label>
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 mb-2"
                  placeholder="ФИО собственника"
                  value={form.owner_name}
                  onChange={e => set('owner_name', e.target.value)}
                />
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                  placeholder="+7 999 000-00-00"
                  value={form.owner_phone}
                  onChange={e => set('owner_phone', e.target.value)}
                />
              </div>

              <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-xl">
                <Star className="w-5 h-5 text-amber-400 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-amber-400 font-medium">Эксклюзивный договор</p>
                  <p className="text-xs text-amber-400/70 mt-0.5">Объект закреплён за вашим агентством</p>
                </div>
                <button onClick={() => set('exclusive', !form.exclusive)}
                  className={`w-10 h-6 rounded-full transition-colors ${form.exclusive ? 'bg-amber-500' : 'bg-slate-600'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform mx-1 ${form.exclusive ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition-colors">
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Добавить объект'}
          </button>
        </div>
      </div>
    </div>
  );
}
