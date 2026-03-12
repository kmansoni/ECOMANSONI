/**
 * CRMHRJobForm — форма вакансии.
 * Реализует полный функционал hh.ru Работодатель + SuperJob + внутренний ATS:
 * тип занятости, грейд, ЗП вилка, требования, навыки, описание, условия.
 */
import { useState } from "react";
import { X, Save, Briefcase, DollarSign, Star, Clock, Users, Globe } from "lucide-react";
import { crm, type HRJob, type HREmploymentType, type HRGrade, type HREnglishLevel } from "@/lib/crm";
import { toast } from "sonner";

const EMPLOYMENT_TYPES: Array<{ value: HREmploymentType; label: string }> = [
  { value: 'full_time',   label: 'Полная занятость' },
  { value: 'part_time',   label: 'Частичная' },
  { value: 'remote',      label: 'Удалённо' },
  { value: 'hybrid',      label: 'Гибрид' },
  { value: 'contract',    label: 'Контракт' },
  { value: 'internship',  label: 'Стажировка' },
  { value: 'freelance',   label: 'Фриланс' },
];

const GRADES: Array<{ value: HRGrade; label: string }> = [
  { value: 'intern',     label: 'Intern' },
  { value: 'junior',     label: 'Junior' },
  { value: 'middle',     label: 'Middle' },
  { value: 'senior',     label: 'Senior' },
  { value: 'lead',       label: 'Lead' },
  { value: 'principal',  label: 'Principal' },
  { value: 'director',   label: 'Director' },
  { value: 'head',       label: 'Head of' },
];

const ENGLISH_LEVELS: Array<{ value: HREnglishLevel; label: string }> = [
  { value: 'none',              label: 'Нет' },
  { value: 'basic',             label: 'Базовый' },
  { value: 'pre_intermediate',  label: 'Pre-Intermediate' },
  { value: 'intermediate',      label: 'Intermediate (B1)' },
  { value: 'upper_intermediate',label: 'Upper-Intermediate (B2)' },
  { value: 'advanced',          label: 'Advanced (C1)' },
  { value: 'fluent',            label: 'Fluent / Native' },
];

const PUBLISHED_SOURCES = ['hh.ru', 'SuperJob', 'Rabota.ru', 'LinkedIn', 'Telegram', 'Авито Работа', 'Зарплата.ру', 'Сайт компании'];

const PRIORITY_OPTIONS = [
  { value: 'low',    label: 'Низкий',   color: 'bg-slate-600' },
  { value: 'normal', label: 'Обычный',  color: 'bg-blue-600' },
  { value: 'high',   label: 'Высокий',  color: 'bg-amber-600' },
  { value: 'urgent', label: '🔥 Срочно', color: 'bg-red-600' },
];

interface Props {
  initial?: Partial<HRJob>;
  onClose: () => void;
  onSaved: (job: HRJob) => void;
}

export function CRMHRJobForm({ initial, onClose, onSaved }: Props) {
  const isEdit = Boolean(initial?.id);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<'main'|'requirements'|'description'>('main');

  const [form, setForm] = useState({
    title:            initial?.title            ?? '',
    department:       initial?.department       ?? '',
    team:             initial?.team             ?? '',
    location:         initial?.location         ?? 'Москва',
    employment_type:  initial?.employment_type  ?? 'full_time',
    grade:            initial?.grade            ?? '' as string,
    salary_min:       String(initial?.salary_min ?? ''),
    salary_max:       String(initial?.salary_max ?? ''),
    salary_hidden:    initial?.salary_hidden    ?? false,
    salary_gross:     initial?.salary_gross     ?? true,
    required_skills:  initial?.required_skills  ?? [] as string[],
    preferred_skills: initial?.preferred_skills ?? [] as string[],
    experience_min:   String(initial?.experience_min ?? ''),
    english_level:    initial?.english_level    ?? '' as string,
    status:           initial?.status           ?? 'open',
    priority:         initial?.priority         ?? 'normal',
    openings:         String(initial?.openings  ?? '1'),
    hiring_manager:   initial?.hiring_manager   ?? '',
    published_sources: initial?.published_sources ?? [] as string[],
    deadline:         initial?.deadline         ?? '',
    description:      initial?.description      ?? '',
    responsibilities: initial?.responsibilities ?? '',
    conditions:       initial?.conditions       ?? '',
  });

  const [skillInput, setSkillInput] = useState('');
  const [prefSkillInput, setPrefSkillInput] = useState('');

  const set = (field: string, value: string | boolean | string[]) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const addSkill = (skill: string, preferred = false) => {
    const s = skill.trim();
    if (!s) return;
    if (preferred) {
      if (!form.preferred_skills.includes(s)) set('preferred_skills', [...form.preferred_skills, s]);
      setPrefSkillInput('');
    } else {
      if (!form.required_skills.includes(s)) set('required_skills', [...form.required_skills, s]);
      setSkillInput('');
    }
  };

  const removeSkill = (skill: string, preferred: boolean) => {
    if (preferred) set('preferred_skills', form.preferred_skills.filter(s => s !== skill));
    else set('required_skills', form.required_skills.filter(s => s !== skill));
  };

  const toggleSource = (src: string) =>
    set('published_sources', form.published_sources.includes(src)
      ? form.published_sources.filter(s => s !== src)
      : [...form.published_sources, src]
    );

  const handleSubmit = async () => {
    if (!form.title.trim()) { toast.error('Укажите название вакансии'); return; }
    setSaving(true);
    try {
      const payload: Partial<HRJob> = {
        title:            form.title,
        department:       form.department || null,
        team:             form.team || null,
        location:         form.location || null,
        employment_type:  form.employment_type as HREmploymentType,
        grade:            form.grade ? (form.grade as HRGrade) : null,
        salary_min:       parseInt(form.salary_min) || null,
        salary_max:       parseInt(form.salary_max) || null,
        salary_hidden:    form.salary_hidden,
        salary_gross:     form.salary_gross,
        required_skills:  form.required_skills,
        preferred_skills: form.preferred_skills,
        experience_min:   parseFloat(form.experience_min) || null,
        english_level:    form.english_level ? (form.english_level as HREnglishLevel) : null,
        status:           form.status as HRJob['status'],
        priority:         form.priority as HRJob['priority'],
        openings:         parseInt(form.openings) || 1,
        hiring_manager:   form.hiring_manager || null,
        published_sources: form.published_sources,
        deadline:         form.deadline || null,
        description:      form.description || null,
        responsibilities: form.responsibilities || null,
        conditions:       form.conditions || null,
      };

      let saved: HRJob;
      if (isEdit && initial?.id) {
        saved = await crm.updateHRJob(initial.id, payload);
      } else {
        saved = await crm.createHRJob(payload);
      }
      toast.success(isEdit ? 'Вакансия обновлена' : 'Вакансия создана');
      onSaved(saved);
    } catch (err) {
      toast.error('Ошибка сохранения вакансии');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg"><Briefcase className="w-4 h-4 text-indigo-400" /></div>
            <h2 className="text-white font-semibold">{isEdit ? 'Редактировать вакансию' : 'Новая вакансия'}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-700"><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        {/* Section tabs */}
        <div className="flex border-b border-slate-700">
          {[
            { id: 'main',         label: 'Основное' },
            { id: 'requirements', label: 'Требования' },
            { id: 'description',  label: 'Описание' },
          ].map(s => (
            <button key={s.id}
              onClick={() => setSection(s.id as typeof section)}
              className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                section === s.id ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* ── MAIN ── */}
          {section === 'main' && (
            <>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Название вакансии *</label>
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  placeholder="Backend Developer (Python)"
                  value={form.title}
                  onChange={e => set('title', e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Отдел</label>
                  <input
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    placeholder="Разработка"
                    value={form.department}
                    onChange={e => set('department', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Команда</label>
                  <input
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    placeholder="Platform"
                    value={form.team}
                    onChange={e => set('team', e.target.value)}
                  />
                </div>
              </div>

              {/* Grade */}
              <div>
                <label className="text-xs text-slate-400 mb-2 block flex items-center gap-1">
                  <Star className="w-3 h-3" /> Грейд / Уровень
                </label>
                <div className="flex flex-wrap gap-2">
                  {GRADES.map(g => (
                    <button key={g.value}
                      onClick={() => set('grade', form.grade === g.value ? '' : g.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        form.grade === g.value ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Employment type */}
              <div>
                <label className="text-xs text-slate-400 mb-2 block flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Тип занятости
                </label>
                <div className="flex flex-wrap gap-2">
                  {EMPLOYMENT_TYPES.map(t => (
                    <button key={t.value}
                      onClick={() => set('employment_type', t.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        form.employment_type === t.value ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Location */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Город / Расположение</label>
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  placeholder="Москва / Удалённо"
                  value={form.location}
                  onChange={e => set('location', e.target.value)}
                />
              </div>

              {/* Salary */}
              <div>
                <label className="text-xs text-slate-400 mb-2 block flex items-center gap-1">
                  <DollarSign className="w-3 h-3" /> Зарплата (₽)
                </label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input type="number"
                    className="bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    placeholder="от 120 000"
                    value={form.salary_min}
                    onChange={e => set('salary_min', e.target.value)}
                  />
                  <input type="number"
                    className="bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    placeholder="до 200 000"
                    value={form.salary_max}
                    onChange={e => set('salary_max', e.target.value)}
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => set('salary_gross', !form.salary_gross)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs text-slate-300"
                  >
                    {form.salary_gross ? '✓ Gross' : '✓ Net'}
                  </button>
                  <button
                    onClick={() => set('salary_hidden', !form.salary_hidden)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                      form.salary_hidden ? 'bg-slate-600 text-slate-400' : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {form.salary_hidden ? '👁 Скрыта' : '👁 Видна'}
                  </button>
                </div>
              </div>

              {/* Priority + Openings */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-2 block">Приоритет</label>
                  <div className="space-y-1">
                    {PRIORITY_OPTIONS.map(p => (
                      <button key={p.value}
                        onClick={() => set('priority', p.value)}
                        className={`w-full py-1.5 px-3 rounded-lg text-xs text-left font-medium transition-colors ${
                          form.priority === p.value ? `${p.color} text-white` : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-3">
                    <label className="text-xs text-slate-400 mb-1 block flex items-center gap-1">
                      <Users className="w-3 h-3" /> Кол-во позиций
                    </label>
                    <input type="number" min="1"
                      className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                      value={form.openings}
                      onChange={e => set('openings', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Нанимающий менеджер</label>
                    <input
                      className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
                      placeholder="Иван Иванов"
                      value={form.hiring_manager}
                      onChange={e => set('hiring_manager', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="text-xs text-slate-400 mb-2 block">Статус вакансии</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { v:'draft',    l:'Черновик' },
                    { v:'open',     l:'Открыта' },
                    { v:'paused',   l:'Пауза' },
                    { v:'closed',   l:'Закрыта' },
                    { v:'archived', l:'Архив' },
                  ].map(s => (
                    <button key={s.v} onClick={() => set('status', s.v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        form.status === s.v
                          ? s.v === 'open' ? 'bg-green-600 text-white'
                            : s.v === 'closed' || s.v === 'archived' ? 'bg-red-600 text-white'
                            : 'bg-indigo-600 text-white'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {s.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Deadline */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Дедлайн подбора</label>
                <input type="date"
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                  value={form.deadline}
                  onChange={e => set('deadline', e.target.value)}
                />
              </div>

              {/* Published sources */}
              <div>
                <label className="text-xs text-slate-400 mb-2 block flex items-center gap-1">
                  <Globe className="w-3 h-3" /> Опубликовано на
                </label>
                <div className="flex flex-wrap gap-2">
                  {PUBLISHED_SOURCES.map(src => (
                    <button key={src} onClick={() => toggleSource(src)}
                      className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        form.published_sources.includes(src) ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {src}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── REQUIREMENTS ── */}
          {section === 'requirements' && (
            <>
              {/* Experience */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Опыт от (лет)</label>
                  <input type="number" min="0" step="0.5"
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                    placeholder="1.5"
                    value={form.experience_min}
                    onChange={e => set('experience_min', e.target.value)}
                  />
                </div>
              </div>

              {/* English */}
              <div>
                <label className="text-xs text-slate-400 mb-2 block">Уровень English</label>
                <div className="flex flex-col gap-1">
                  {ENGLISH_LEVELS.map(e => (
                    <button key={e.value} onClick={() => set('english_level', form.english_level === e.value ? '' : e.value)}
                      className={`py-2 px-3 rounded-lg text-sm text-left transition-colors ${
                        form.english_level === e.value ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Required skills */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">
                  ✓ Обязательные навыки / стек
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
                    placeholder="Python, FastAPI, PostgreSQL..."
                    value={skillInput}
                    onChange={e => setSkillInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(skillInput); } }}
                  />
                  <button onClick={() => addSkill(skillInput)} className="px-3 py-2 bg-indigo-600 text-white rounded-xl text-sm">+</button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {form.required_skills.map(s => (
                    <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-600/30 text-indigo-300 rounded-full text-xs">
                      {s}<button onClick={() => removeSkill(s, false)}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Preferred skills */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">
                  + Желательные навыки
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-slate-500 text-sm"
                    placeholder="Docker, Kubernetes, Redis..."
                    value={prefSkillInput}
                    onChange={e => setPrefSkillInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(prefSkillInput, true); } }}
                  />
                  <button onClick={() => addSkill(prefSkillInput, true)} className="px-3 py-2 bg-slate-600 text-white rounded-xl text-sm">+</button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {form.preferred_skills.map(s => (
                    <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-600 text-slate-300 rounded-full text-xs">
                      {s}<button onClick={() => removeSkill(s, true)}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── DESCRIPTION ── */}
          {section === 'description' && (
            <>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">О компании / проекте</label>
                <textarea
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm resize-none"
                  rows={3}
                  placeholder="Расскажите о компании, продукте, команде..."
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Обязанности</label>
                <textarea
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm resize-none"
                  rows={4}
                  placeholder="• Разрабатывать высоконагруженные сервисы&#10;• Участвовать в code review&#10;• Проводить технические интервью..."
                  value={form.responsibilities}
                  onChange={e => set('responsibilities', e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Условия и бонусы</label>
                <textarea
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm resize-none"
                  rows={3}
                  placeholder="• Удалённая работа&#10;• ДМС&#10;• Обучение и конференции&#10;• Гибкий график..."
                  value={form.conditions}
                  onChange={e => set('conditions', e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium">
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-medium"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать вакансию'}
          </button>
        </div>
      </div>
    </div>
  );
}
