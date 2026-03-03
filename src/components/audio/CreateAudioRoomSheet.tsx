import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Radio, Calendar, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAudioRoom } from '@/hooks/useAudioRoom';
import { useNavigate } from 'react-router-dom';

interface CreateAudioRoomSheetProps {
  open: boolean;
  onClose: () => void;
}

export function CreateAudioRoomSheet({ open, onClose }: CreateAudioRoomSheetProps) {
  const navigate = useNavigate();
  const { createRoom } = useAudioRoom();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setLoading(true);
    try {
      const room = await createRoom(
        title.trim(),
        description.trim() || undefined,
        scheduleMode && scheduledAt ? new Date(scheduledAt).toISOString() : undefined
      );
      if (room) {
        onClose();
        navigate(`/audio-rooms/${room.id}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40"
            onClick={onClose}
          />
          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-3xl p-6 pb-safe"
          >
            {/* Handle */}
            <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-6" />

            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Новая комната</h2>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="room-title">Название *</Label>
                <Input
                  id="room-title"
                  placeholder="О чём поговорим?"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="mt-1"
                  maxLength={100}
                />
              </div>

              <div>
                <Label htmlFor="room-desc">Описание</Label>
                <Textarea
                  id="room-desc"
                  placeholder="Дополнительная информация..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="mt-1 resize-none"
                  rows={2}
                  maxLength={300}
                />
              </div>

              {/* Schedule toggle */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setScheduleMode(false)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border transition-colors ${
                    !scheduleMode ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'
                  }`}
                >
                  <Radio className="w-4 h-4" />
                  <span className="text-sm font-medium">Начать сейчас</span>
                </button>
                <button
                  onClick={() => setScheduleMode(true)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border transition-colors ${
                    scheduleMode ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                  <span className="text-sm font-medium">Запланировать</span>
                </button>
              </div>

              {scheduleMode && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <Label htmlFor="scheduled-at">Дата и время</Label>
                  <Input
                    id="scheduled-at"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={e => setScheduledAt(e.target.value)}
                    className="mt-1"
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </motion.div>
              )}

              <Button
                className="w-full gap-2"
                onClick={handleCreate}
                disabled={!title.trim() || loading || (scheduleMode && !scheduledAt)}
              >
                {loading ? (
                  <span className="animate-spin">⏳</span>
                ) : (
                  <>
                    <Radio className="w-4 h-4" />
                    {scheduleMode ? 'Запланировать' : 'Начать комнату'}
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
