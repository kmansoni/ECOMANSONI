/**
 * ReportEventSheet — Bottom sheet for reporting road events.
 */
import { useState } from 'react';
import { X, Send, Camera, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRoadEvents, ROAD_EVENT_LABELS, type RoadEventType, type RoadEvent } from '@/stores/roadEventsStore';
import { supabase, dbLoose } from '@/lib/supabase';
import { toast } from 'sonner';
import type { LatLng } from '@/types/taxi';

const EVENT_TYPES = Object.entries(ROAD_EVENT_LABELS) as [RoadEventType, typeof ROAD_EVENT_LABELS[RoadEventType]][];

interface ReportEventSheetProps {
  open: boolean;
  onClose: () => void;
  location: LatLng | null;
}

export function ReportEventSheet({ open, onClose, location }: ReportEventSheetProps) {
  const { addEvent } = useRoadEvents();
  const [selectedType, setSelectedType] = useState<RoadEventType | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!selectedType || !location) return;
    
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const eventInfo = ROAD_EVENT_LABELS[selectedType];
      
      const event: RoadEvent = {
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: selectedType,
        location,
        description: description || eventInfo.label,
        reportedBy: user?.id || 'anonymous',
        reportedAt: Date.now(),
        expiresAt: Date.now() + eventInfo.duration,
        upvotes: 0,
        downvotes: 0,
        verified: false,
      };

      addEvent(event);

      // Try to sync to Supabase
      try {
        await dbLoose.from('road_events').insert({
          id: event.id,
          type: event.type,
          lat: event.location.lat,
          lng: event.location.lng,
          description: event.description,
          reported_by: event.reportedBy,
          expires_at: new Date(event.expiresAt).toISOString(),
        });
      } catch {
        // Offline — event saved locally, will sync later
      }

      toast.success(`${eventInfo.emoji} ${eventInfo.label} отмечено на карте`);
      onClose();
      setSelectedType(null);
      setDescription('');
    } catch (err) {
      toast.error('Не удалось отправить событие');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-h-[85vh] bg-gray-900 rounded-t-3xl p-5 pb-8 overflow-y-auto animate-in slide-in-from-bottom">
        {/* Handle */}
        <div className="w-10 h-1 bg-gray-600 rounded-full mx-auto mb-4" />
        
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Сообщить о событии</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {location && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-white/5 rounded-lg text-sm text-gray-400">
            <MapPin className="h-4 w-4" />
            <span>{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</span>
          </div>
        )}

        {/* Event type grid */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {EVENT_TYPES.map(([type, info]) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={cn(
                'flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all',
                selectedType === type
                  ? 'bg-blue-500/20 border-2 border-blue-500 scale-105'
                  : 'bg-white/5 border border-white/10 hover:bg-white/10'
              )}
            >
              <span className="text-2xl">{info.emoji}</span>
              <span className="text-[11px] text-center leading-tight">{info.label}</span>
            </button>
          ))}
        </div>

        {/* Description */}
        <textarea
          placeholder="Комментарий (необязательно)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 resize-none h-20 text-sm focus:outline-none focus:border-blue-500"
          maxLength={200}
        />

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!selectedType || !location || submitting}
          className={cn(
            'w-full mt-4 py-3.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all',
            selectedType && location
              ? 'bg-blue-600 hover:bg-blue-500 active:scale-[0.98]'
              : 'bg-gray-700 opacity-50 cursor-not-allowed'
          )}
        >
          <Send className="h-4 w-4" />
          {submitting ? 'Отправка...' : 'Отправить'}
        </button>
      </div>
    </div>
  );
}
