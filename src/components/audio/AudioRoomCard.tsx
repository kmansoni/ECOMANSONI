import React from 'react';
import { motion } from 'framer-motion';
import { Users, Clock } from 'lucide-react';
import { type AudioRoom, type AudioRoomParticipant } from '@/hooks/useAudioRoom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface AudioRoomCardProps {
  room: AudioRoom;
  speakers?: AudioRoomParticipant[];
  onClick?: () => void;
}

function formatScheduled(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('ru-RU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function AudioRoomCard({ room, speakers = [], onClick }: AudioRoomCardProps) {
  const isLive = room.status === 'live';

  return (
    <motion.div
      onClick={onClick}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      className="bg-card border border-border rounded-2xl p-4 cursor-pointer hover:border-primary/40 transition-colors"
    >
      {/* Status badge + listener count */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isLive ? (
            <div className="flex items-center gap-1.5 bg-red-500/15 px-2 py-0.5 rounded-full">
              <motion.div
                className="w-2 h-2 rounded-full bg-red-500"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              <span className="text-red-500 text-xs font-semibold">LIVE</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-muted px-2 py-0.5 rounded-full">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground text-xs">
                {room.scheduled_at ? formatScheduled(room.scheduled_at) : 'Запланировано'}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 text-muted-foreground text-sm">
          <Users className="w-4 h-4" />
          <span>{room.listener_count}</span>
        </div>
      </div>

      {/* Title */}
      <h3 className="font-semibold text-foreground mb-1 line-clamp-2">{room.title}</h3>
      {room.description && (
        <p className="text-sm text-muted-foreground mb-3 line-clamp-1">{room.description}</p>
      )}

      {/* Host + Speakers */}
      <div className="flex items-center gap-2">
        {room.host && (
          <div className="flex items-center gap-1.5">
            <Avatar className="w-6 h-6">
              <AvatarImage src={room.host.avatar_url ?? undefined} />
              <AvatarFallback className="text-[10px]">
                {(room.host.full_name || room.host.username || '?')[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground">
              {room.host.full_name || room.host.username}
            </span>
          </div>
        )}

        {speakers.length > 0 && (
          <div className="flex -space-x-2 ml-auto">
            {speakers.slice(0, 3).map(sp => (
              <Avatar key={sp.id} className="w-6 h-6 border-2 border-background">
                <AvatarImage src={sp.profile?.avatar_url ?? undefined} />
                <AvatarFallback className="text-[10px]">
                  {(sp.profile?.full_name || sp.profile?.username || '?')[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}
            {speakers.length > 3 && (
              <div className="w-6 h-6 rounded-full border-2 border-background bg-muted flex items-center justify-center">
                <span className="text-[9px] text-muted-foreground">+{speakers.length - 3}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
