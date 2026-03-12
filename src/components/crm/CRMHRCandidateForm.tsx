/**
 * CRMHRCandidateForm — карточка кандидата (ATS-уровень hh.ru + SuperJob + Greenhouse).
 * Функции: контакты, текущая/ожидаемая ЗП, опыт, грейд, навыки/стек,
 * английский, формат работы, источник, теги, чёрный список / VIP.
 */
import { useState } from "react";
import { X, Save, User, Phone, Mail, Linkedin, Globe, Star, AlertTriangle, Link as LinkIcon } from "lucide-react";
import { crm, type HRCandidate, type HRGrade, HR_SOURCES } from "@/lib/crm";
import { toast } from "sonner";

const GRADES: Array<{ value: string; label: string }> = [
  { value: 'intern',    label: 'Intern' },
  { value: 'junior',    label: 'Junior' },
  { value: 'middle',    label: 'Middle' },
  { value: 'senior',    label: 'Senior' },
  { value: 'lead',      label: 'Lead' },
  { value: 'principal', label: 'Principal' },
];

const ENGLISH_LEVELS = [
  { value: 'none',              label: 'Нет' },
  { value: 'basic',             label: 'Базовый' },
  { value: 'pre_intermediate',  label: 'Pre-Int' },
  { value: 'intermediate',      label: 'Intermediate' },
  { value: 'upper_intermediate',label: 'Upper-Int' },
  { value: 'advanced',          label: 'Advanced' },
  { value: 'fluent',            label: 'Fluent' },
];

const WORK_FORMATS = [
  { value: 'office', label: 'Офис' },
  { value: 'remote', label: 'Удалённо' },
  { value: 'hybrid', label: 'Гибрид' },
  { value: 'any',    label: 'Любой' },
];

interface Props {
  initial?: Partial<HRCandidate>;
  onClose: () => void;
  onSaved: (candidate: HRCandidate) => void;
}

export function CRMHRCandidateForm({ initial, onClose, onSaved }: Props) {
  const isEdit = Boolean(initial?.id);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<'main'|'work'|'flags'>('main');

  const [form, setForm] = useState({
    name:              initial?.name              ?? '',
    phone:             initial?.phone             ?? '',
    email:             initial?.email             ?? '',
    telegram_handle:   initial?.telegram_handle   ?? '',
    linkedin_url:      initial?.linkedin_url      ?? '',
    resume_url:        initial?.resume_url        ?? '',
    current_company:   initial?.current_company   ?? '',
    current_position:  initial?.current_position  ?? '',
    current_salary:    String(initial?.current_salary  ?? ''),
    expected_salary:   String(initial?.expected_salary ?? ''),
    salary_negotiable: initial?.salary_negotiable ?? true,
    experience_years:  String(initial?.experience_years ?? ''),
    grade:             initial?.grade             ?? '' as string,
    skills:            initial?.skills            ?? [] as string[],
    english_level:     initial?.english_level     ?? '' as string,
    city:              initial?.city              ?? '',
    willing_to_relocate: initial?.willing_to_relocate ?? false,
    work_format:       initial?.work_format       ?? 'any',
    source:            initial?.source            ?? 'direct',
    tags:              initial?.tags              ?? [] as string[],
    notes:             initial?.notes             ?? '',
    blacklisted:       initial?.blacklisted       ?? false,
    blacklist_reason:  initial?.blacklist_reason  ?? '',
    vip:               initial?.vip               ?? false,
  });

  const [skillInput, setSkillInput] = useState('');
  const [tagInput, setTagInput] = useState('');

  const set = (field: string, value: string | boolean | string[]) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const addSkill = (s: string) => {
    const t = s.trim();
    if (t && !form.skills.includes(t)) set('skills', [...form.skills, t]);
    setSkillInput('');
  };

  const addTag = (t: string) => {
    const tag = t.trim();
    if (tag && !form.tags.includes(tag)) set('tags', [...form.tags, tag]);
    setTagInput('');
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('Укажите имя кандидата'); return; }
    setSaving(true);
    try {
      const payload: Partial<HRCandidate> = {
        name:              form.name,
        phone:             form.phone             || null,
        email:             form.email             || null,
        telegram_handle:   form.telegram_handle   || null,
        linkedin_url:      form.linkedin_url      || null,
        resume_url:        form.resume_url        || null,
        current_company:   form.current_company   || null,
        current_position:  form.current_position  || null,
        current_salary:    parseInt(form.current_salary)  || null,
        expected_salary:   parseInt(form.expected_salary) || null,
        salary_negotiable: form.salary_negotiable,
        experience_years:  parseFloat(form.experience_years) || null,
        grade:             form.grade             || null,
        skills:            form.skills,
        english_level:     form.english_level     || null,
        city:              form.city              || null,
        willing_to_relocate: form.willing_to_relocate,
        work_format:       form.work_format as HRCandidate['work_format'],
        source:            form.source,
        tags:              form.tags,
        notes:             form.notes             || null,
        blacklisted:       form.blacklisted,
        blacklist_reason:  form.blacklist_reason  || null,
        vip:               form.vip,
      };

      let saved: HRCandidate;
      if (isEdit && initial?.id) {
        saved = await crm.updateHRCandidate(initial.id, payload);
      } else {
        saved = await crm.createHRCandidate(payload);
      }
      toast.success(isEdit ? 'Кандидат обновлён' : 'Кандидат добавлен');
      onSaved(saved);
    } catch (err) {
      toast.error('Ошибка сохранения кандидата');
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
            <div className={`p-2 rounded-lg ${form.vip ? 'bg-amber-500/20' : form.blacklisted ? 'bg-red-500/20' : 'bg-purple-500/20'}`}>
              <User className={`w-4 h-4 ${form.vip ? 'text-amber-400' : form.blacklisted ? 'text-red-400' : 'text-purple-400'}`} />
            </div>
            <div>
              <h2 className="text-white font-semibold">{isEdit ? 'Редактировать кандидата' : 'Новый кандидат'}</h2>
              {form.vip && <span className="text-xs text-amber-400">⭐ VIP</span>}
              {form.blacklisted && <span className="text-xs text-red-400">🚫 Черный список</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-700"><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700">
          {[
            { id: 'main',  label: 'Контакты' },
            { id: 'work',  label: 'Опыт' },
            { id: 'flags', label: 'Теги/Статус' },
          ].map(s => (
            <button key={s.id}
              onClick={() => setSection(s.id as typeof section)}
              className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                section === s.id ? 'border-purple-500 text-purple-400' : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* ── CONTACTS ── */}
          {section === 'main' && (
            <>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Имя кандидата *</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                  <input
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                    placeholder="Иванов Иван"
                    value={form.name}
                    onChange={e => set('name', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Телефон</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                    <input
                      className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
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
                      className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                      placeholder="ivan@example.com"
                      value={form.email}
                      onChange={e => set('email', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Telegram</label>
                  <input
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                    placeholder="@username"
                    value={form.telegram_handle}
                    onChange={e => set('telegram_handle', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">LinkedIn</label>
                  <div className="relative">
                    <Linkedin className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                    <input
                      className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                      placeholder="linkedin.com/in/..."
                      value={form.linkedin_url}
                      onChange={e => set('linkedin_url', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block flex items-center gap-1">
                  <LinkIcon className="w-3 h-3" /> Ссылка на резюме
                </label>
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  placeholder="hh.ru/resume/abc123 или ссылка на PDF"
                  value={form.resume_url}
                  onChange={e => set('resume_url', e.target.value)}
                />
              </div>

              {/* Source */}
              <div>
                <label className="text-xs text-slate-400 mb-2 block">Источник</label>
                <div className="flex flex-wrap gap-2">
                  {HR_SOURCES.map(s => (
                    <button key={s.value}
                      onClick={() => set('source', s.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        form.source === s.value ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── WORK EXPERIENCE ── */}
          {section === 'work' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Текущая компания</label>
                  <input
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                    placeholder="Yandex, Sber..."
                    value={form.current_company}
                    onChange={e => set('current_company', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Текущая должность</label>
                  <input
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                    placeholder="Senior Python Dev"
                    value={form.current_position}
                    onChange={e => set('current_position', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Текущая ЗП (₽)</label>
                  <input type="number"
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                    placeholder="180 000"
                    value={form.current_salary}
                    onChange={e => set('current_salary', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Ожидаемая ЗП (₽)</label>
                  <input type="number"
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                    placeholder="250 000"
                    value={form.expected_salary}
                    onChange={e => set('expected_salary', e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-slate-800 rounded-xl">
                <span className="text-sm text-slate-300 flex-1">ЗП договорная</span>
                <button onClick={() => set('salary_negotiable', !form.salary_negotiable)}
                  className={`w-10 h-6 rounded-full transition-colors ${form.salary_negotiable ? 'bg-purple-600' : 'bg-slate-600'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform mx-1 ${form.salary_negotiable ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Опыт (лет)</label>
                  <input type="number" step="0.5" min="0"
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-purple-500"
                    placeholder="3.5"
                    value={form.experience_years}
                    onChange={e => set('experience_years', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Город</label>
                  <input
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                    placeholder="Москва"
                    value={form.city}
                    onChange={e => set('city', e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-slate-800 rounded-xl">
                <span className="text-sm text-slate-300 flex-1">Готов к переезду</span>
                <button onClick={() => set('willing_to_relocate', !form.willing_to_relocate)}
                  className={`w-10 h-6 rounded-full transition-colors ${form.willing_to_relocate ? 'bg-purple-600' : 'bg-slate-600'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform mx-1 ${form.willing_to_relocate ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Grade */}
              <div>
                <label className="text-xs text-slate-400 mb-2 block">Грейд</label>
                <div className="flex flex-wrap gap-2">
                  {GRADES.map(g => (
                    <button key={g.value}
                      onClick={() => set('grade', form.grade === g.value ? '' : g.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        form.grade === g.value ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Work format */}
              <div>
                <label className="text-xs text-slate-400 mb-2 block">Формат работы</label>
                <div className="flex gap-2">
                  {WORK_FORMATS.map(f => (
                    <button key={f.value}
                      onClick={() => set('work_format', f.value)}
                      className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${
                        form.work_format === f.value ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* English */}
              <div>
                <label className="text-xs text-slate-400 mb-2 block">Уровень English</label>
                <div className="flex flex-wrap gap-2">
                  {ENGLISH_LEVELS.map(e => (
                    <button key={e.value}
                      onClick={() => set('english_level', form.english_level === e.value ? '' : e.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        form.english_level === e.value ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Skills */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Навыки / Стек</label>
                <div className="flex gap-2 mb-2">
                  <input
                    className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 text-sm"
                    placeholder="Python, React, Go..."
                    value={skillInput}
                    onChange={e => setSkillInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(skillInput); } }}
                  />
                  <button onClick={() => addSkill(skillInput)} className="px-3 py-2 bg-purple-600 text-white rounded-xl text-sm">+</button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {form.skills.map(s => (
                    <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-600/30 text-purple-300 rounded-full text-xs">
                      {s}<button onClick={() => set('skills', form.skills.filter(x => x !== s))}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── FLAGS / TAGS ── */}
          {section === 'flags' && (
            <>
              {/* VIP toggle */}
              <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/30 rounded-xl">
                <Star className="w-5 h-5 text-amber-400 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-amber-400 font-medium">VIP / Звёздный кандидат</p>
                  <p className="text-xs text-amber-400/70">Приоритетный рассмотр</p>
                </div>
                <button onClick={() => set('vip', !form.vip)}
                  className={`w-10 h-6 rounded-full transition-colors ${form.vip ? 'bg-amber-500' : 'bg-slate-600'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform mx-1 ${form.vip ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Blacklist */}
              <div className={`p-4 rounded-xl border ${form.blacklisted ? 'bg-red-500/10 border-red-500/30' : 'bg-slate-800 border-slate-700'}`}>
                <div className="flex items-center gap-3 mb-2">
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-red-400 font-medium">Чёрный список</p>
                    <p className="text-xs text-red-400/70">Кандидат будет скрыт из поиска</p>
                  </div>
                  <button onClick={() => set('blacklisted', !form.blacklisted)}
                    className={`w-10 h-6 rounded-full transition-colors ${form.blacklisted ? 'bg-red-500' : 'bg-slate-600'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full transition-transform mx-1 ${form.blacklisted ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>
                {form.blacklisted && (
                  <input
                    className="w-full bg-slate-800 border border-red-500/30 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none text-sm"
                    placeholder="Причина добавления в ЧС..."
                    value={form.blacklist_reason}
                    onChange={e => set('blacklist_reason', e.target.value)}
                  />
                )}
              </div>

              {/* Tags */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Теги</label>
                <div className="flex gap-2 mb-2">
                  <input
                    className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 text-sm"
                    placeholder="топ-кандидат, хороший коммуникатор..."
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } }}
                  />
                  <button onClick={() => addTag(tagInput)} className="px-3 py-2 bg-slate-700 text-slate-300 rounded-xl text-sm">+</button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {form.tags.map(t => (
                    <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-700 text-slate-300 rounded-full text-xs">
                      {t}<button onClick={() => set('tags', form.tags.filter(x => x !== t))}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Заметки рекрутера</label>
                <textarea
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 text-sm resize-none"
                  rows={4}
                  placeholder="Впечатление от первого звонка, сильные стороны, оговорки..."
                  value={form.notes}
                  onChange={e => set('notes', e.target.value)}
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
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl font-medium"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Добавить кандидата'}
          </button>
        </div>
      </div>
    </div>
  );
}
