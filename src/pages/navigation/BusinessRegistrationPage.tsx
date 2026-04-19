/**
 * BusinessRegistrationPage — Page for business registration (IP/OOO/Self-employed).
 * Businesses can register their location and details for display on the map.
 * Admin moderation required before public visibility.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, User, Briefcase, Send, MapPin, Phone, Globe, Clock, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

type BusinessType = 'ip' | 'ooo' | 'self_employed';

interface BusinessForm {
  businessType: BusinessType;
  name: string;
  legalName: string;
  inn: string;
  ogrn: string;
  address: string;
  lat: number | null;
  lng: number | null;
  phone: string;
  website: string;
  email: string;
  category: string;
  description: string;
  workingHours: string;
}

const CATEGORIES = [
  'Кафе / Ресторан',
  'Магазин',
  'Автосервис',
  'Салон красоты',
  'Медицина',
  'Образование',
  'Юридические услуги',
  'Финансы',
  'Спорт и фитнес',
  'Доставка',
  'Гостиница',
  'Развлечения',
  'Другое',
];

const BUSINESS_TYPES: { id: BusinessType; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'ip', label: 'ИП', icon: <User className="h-6 w-6" />, desc: 'Индивидуальный предприниматель' },
  { id: 'ooo', label: 'ООО', icon: <Building2 className="h-6 w-6" />, desc: 'Общество с ограниченной ответственностью' },
  { id: 'self_employed', label: 'Самозанятый', icon: <Briefcase className="h-6 w-6" />, desc: 'Налог на профессиональный доход' },
];

const initialForm: BusinessForm = {
  businessType: 'ip',
  name: '',
  legalName: '',
  inn: '',
  ogrn: '',
  address: '',
  lat: null,
  lng: null,
  phone: '',
  website: '',
  email: '',
  category: '',
  description: '',
  workingHours: '',
};

export default function BusinessRegistrationPage() {
  const routerNav = useNavigate();
  const [step, setStep] = useState(0); // 0: type selection, 1: details, 2: confirmation
  const [form, setForm] = useState<BusinessForm>(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const update = (field: keyof BusinessForm, value: string | number | null) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!form.name || !form.inn || !form.address || !form.phone || !form.category) {
      toast.error('Заполните обязательные поля');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Необходимо авторизоваться');
        return;
      }

      const { error } = await supabase.from('business_registrations').insert({
        user_id: user.id,
        business_type: form.businessType,
        name: form.name,
        legal_name: form.legalName,
        inn: form.inn,
        ogrn: form.ogrn || null,
        address: form.address,
        lat: form.lat,
        lng: form.lng,
        phone: form.phone,
        website: form.website || null,
        email: form.email || null,
        category: form.category,
        description: form.description || null,
        working_hours: form.workingHours || null,
        status: 'pending', // Requires admin moderation
      });

      if (error) throw error;

      toast.success('Заявка отправлена на модерацию');
      setStep(2);
    } catch (err: any) {
      toast.error(`Ошибка: ${err.message || 'Не удалось отправить'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="sticky top-0 z-50 flex items-center gap-3 p-4 bg-gray-950/90 backdrop-blur-md border-b border-white/5">
        <button onClick={() => step > 0 ? setStep(s => s - 1) : routerNav(-1)} className="p-2 -ml-2 rounded-lg hover:bg-white/5">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold">
          {step === 0 && 'Регистрация бизнеса'}
          {step === 1 && 'Данные бизнеса'}
          {step === 2 && 'Заявка отправлена'}
        </h1>
      </header>

      <div className="p-4 pb-20">
        {/* Step 0: Business type selection */}
        {step === 0 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400 mb-4">
              Выберите форму бизнеса для размещения на карте навигатора.
              После проверки модератором ваш бизнес станет виден всем пользователям.
            </p>

            {BUSINESS_TYPES.map((bt) => (
              <button
                key={bt.id}
                onClick={() => { update('businessType', bt.id); setStep(1); }}
                className={cn(
                  'w-full flex items-center gap-4 p-5 rounded-xl transition-all',
                  'bg-white/5 border border-white/10 hover:bg-white/10 hover:border-blue-500/30',
                  form.businessType === bt.id && 'border-blue-500/50 bg-blue-500/10'
                )}
              >
                <div className="p-3 rounded-xl bg-blue-500/20 text-blue-400">
                  {bt.icon}
                </div>
                <div className="text-left">
                  <p className="font-semibold text-lg">{bt.label}</p>
                  <p className="text-sm text-gray-400">{bt.desc}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Step 1: Business details form */}
        {step === 1 && (
          <div className="space-y-4">
            <FormField label="Название *" icon={<Building2 className="h-4 w-4" />}>
              <input
                type="text"
                placeholder="Как будет отображаться на карте"
                value={form.name}
                onChange={e => update('name', e.target.value)}
                className="form-input"
                maxLength={100}
              />
            </FormField>

            <FormField label="Юридическое название" icon={<Briefcase className="h-4 w-4" />}>
              <input
                type="text"
                placeholder={form.businessType === 'ip' ? 'ИП Иванов И.И.' : 'ООО "Компания"'}
                value={form.legalName}
                onChange={e => update('legalName', e.target.value)}
                className="form-input"
                maxLength={200}
              />
            </FormField>

            <FormField label="ИНН *" icon={<Briefcase className="h-4 w-4" />}>
              <input
                type="text"
                placeholder={form.businessType === 'ooo' ? '10 цифр' : '12 цифр'}
                value={form.inn}
                onChange={e => update('inn', e.target.value.replace(/\D/g, ''))}
                className="form-input"
                maxLength={12}
                inputMode="numeric"
              />
            </FormField>

            {form.businessType !== 'self_employed' && (
              <FormField label="ОГРН / ОГРНИП" icon={<Briefcase className="h-4 w-4" />}>
                <input
                  type="text"
                  placeholder={form.businessType === 'ooo' ? '13 цифр' : '15 цифр'}
                  value={form.ogrn}
                  onChange={e => update('ogrn', e.target.value.replace(/\D/g, ''))}
                  className="form-input"
                  maxLength={15}
                  inputMode="numeric"
                />
              </FormField>
            )}

            <FormField label="Адрес *" icon={<MapPin className="h-4 w-4" />}>
              <input
                type="text"
                placeholder="Москва, ул. Примерная, д. 1"
                value={form.address}
                onChange={e => update('address', e.target.value)}
                className="form-input"
                maxLength={200}
              />
            </FormField>

            <FormField label="Категория *" icon={<Building2 className="h-4 w-4" />}>
              <select
                value={form.category}
                onChange={e => update('category', e.target.value)}
                className="form-input bg-gray-800"
              >
                <option value="">Выберите категорию</option>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Телефон *" icon={<Phone className="h-4 w-4" />}>
              <input
                type="tel"
                placeholder="+7 (999) 123-45-67"
                value={form.phone}
                onChange={e => update('phone', e.target.value)}
                className="form-input"
                maxLength={20}
              />
            </FormField>

            <FormField label="Сайт" icon={<Globe className="h-4 w-4" />}>
              <input
                type="url"
                placeholder="https://example.com"
                value={form.website}
                onChange={e => update('website', e.target.value)}
                className="form-input"
              />
            </FormField>

            <FormField label="Часы работы" icon={<Clock className="h-4 w-4" />}>
              <input
                type="text"
                placeholder="Пн-Пт 9:00-18:00, Сб 10:00-15:00"
                value={form.workingHours}
                onChange={e => update('workingHours', e.target.value)}
                className="form-input"
              />
            </FormField>

            <FormField label="Описание" icon={<Building2 className="h-4 w-4" />}>
              <textarea
                placeholder="Краткое описание деятельности"
                value={form.description}
                onChange={e => update('description', e.target.value)}
                className="form-input resize-none h-24"
                maxLength={500}
              />
            </FormField>

            <button
              onClick={handleSubmit}
              disabled={submitting || !form.name || !form.inn || !form.address || !form.phone || !form.category}
              className={cn(
                'w-full py-3.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2 mt-6',
                'transition-all active:scale-[0.98]',
                form.name && form.inn && form.address && form.phone && form.category
                  ? 'bg-blue-600 hover:bg-blue-500'
                  : 'bg-gray-700 opacity-50 cursor-not-allowed'
              )}
            >
              <Send className="h-4 w-4" />
              {submitting ? 'Отправка...' : 'Отправить на модерацию'}
            </button>
          </div>
        )}

        {/* Step 2: Confirmation */}
        {step === 2 && (
          <div className="flex flex-col items-center text-center pt-12">
            <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mb-6">
              <Building2 className="h-10 w-10 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Заявка отправлена!</h2>
            <p className="text-gray-400 max-w-sm mb-8">
              Ваша заявка на регистрацию бизнеса «{form.name}» будет рассмотрена модератором
              в течение 1-3 рабочих дней. Вы получите уведомление о результате.
            </p>
            <button
              onClick={() => routerNav(-1)}
              className="px-8 py-3 rounded-xl bg-white/10 hover:bg-white/15 font-medium transition-colors"
            >
              Вернуться
            </button>
          </div>
        )}
      </div>

      <style>{`
        .form-input {
          width: 100%;
          padding: 0.75rem 1rem;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 0.75rem;
          color: white;
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.2s;
        }
        .form-input:focus {
          border-color: rgba(59,130,246,0.5);
        }
        .form-input::placeholder {
          color: rgba(156,163,175,0.6);
        }
      `}</style>
    </div>
  );
}

function FormField({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="flex items-center gap-2 text-sm text-gray-400 mb-1.5">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}
