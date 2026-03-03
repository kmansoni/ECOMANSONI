import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const TOPICS = [
  { id: 'food', label: 'Еда', emoji: '🍕' },
  { id: 'travel', label: 'Путешествия', emoji: '✈️' },
  { id: 'fashion', label: 'Мода', emoji: '👗' },
  { id: 'tech', label: 'Технологии', emoji: '💻' },
  { id: 'sport', label: 'Спорт', emoji: '⚽' },
  { id: 'music', label: 'Музыка', emoji: '🎵' },
  { id: 'art', label: 'Искусство', emoji: '🎨' },
  { id: 'nature', label: 'Природа', emoji: '🌿' },
  { id: 'fitness', label: 'Фитнес', emoji: '💪' },
  { id: 'beauty', label: 'Красота', emoji: '💄' },
  { id: 'humor', label: 'Юмор', emoji: '😂' },
  { id: 'science', label: 'Наука', emoji: '🔬' },
  { id: 'gaming', label: 'Игры', emoji: '🎮' },
  { id: 'cinema', label: 'Кино', emoji: '🎬' },
  { id: 'books', label: 'Книги', emoji: '📚' },
  { id: 'photography', label: 'Фотография', emoji: '📷' },
  { id: 'design', label: 'Дизайн', emoji: '✏️' },
  { id: 'business', label: 'Бизнес', emoji: '💼' },
  { id: 'education', label: 'Образование', emoji: '🎓' },
  { id: 'animals', label: 'Животные', emoji: '🐾' },
];

export default function ContentPreferencesPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await (supabase as any)
        .from('content_preferences')
        .select('topics')
        .eq('user_id', user.id)
        .single();
      if (data?.topics) {
        const active = Object.entries(data.topics)
          .filter(([, v]) => v === true)
          .map(([k]) => k);
        setSelected(new Set(active));
      }
    })();
  }, []);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const topics: Record<string, boolean> = {};
      TOPICS.forEach(t => { topics[t.id] = selected.has(t.id); });

      await (supabase as any)
        .from('content_preferences')
        .upsert({ user_id: user.id, topics, updated_at: new Date().toISOString() });

      toast.success('Предпочтения сохранены');
      navigate(-1);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-zinc-800 flex items-center gap-3 px-4 py-3">
        <button onClick={() => navigate(-1)} className="text-zinc-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-lg flex-1">Мои интересы</h1>
        <button
          onClick={save}
          disabled={saving}
          className="bg-white text-black font-semibold text-sm px-4 py-1.5 rounded-full disabled:opacity-50"
        >
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>

      <div className="px-4 py-4">
        <p className="text-zinc-400 text-sm mb-6">
          Выберите темы, которые вам интересны. Мы будем рекомендовать контент на их основе.
        </p>

        <div className="grid grid-cols-3 gap-3">
          {TOPICS.map((topic, i) => {
            const active = selected.has(topic.id);
            return (
              <motion.button
                key={topic.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.02 }}
                onClick={() => toggle(topic.id)}
                className={`relative flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                  active
                    ? 'border-white bg-white/10'
                    : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600'
                }`}
              >
                {active && (
                  <div className="absolute top-2 right-2 w-4 h-4 bg-white rounded-full flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-black" />
                  </div>
                )}
                <span className="text-3xl">{topic.emoji}</span>
                <span className="text-xs font-medium text-center">{topic.label}</span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
