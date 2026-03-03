import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Hand, LogOut, Crown, ChevronDown } from 'lucide-react';
import { useAudioRoom } from '@/hooks/useAudioRoom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface AudioRoomViewProps {
  roomId: string;
}

function SpeakerAvatar({ participant, isHost, onPromote, onDemote, canManage }: {
  participant: { id: string; user_id: string; role: string; is_muted: boolean; hand_raised: boolean; profile?: { username: string; full_name: string | null; avatar_url: string | null } };
  isHost: boolean;
  onPromote?: (userId: string) => void;
  onDemote?: (userId: string) => void;
  canManage?: boolean;
}) {
  const name = participant.profile?.full_name || participant.profile?.username || '?';
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <motion.div
          animate={!participant.is_muted ? {
            boxShadow: ['0 0 0 0px rgba(99,102,241,0.4)', '0 0 0 8px rgba(99,102,241,0)']
          } : {}}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="rounded-full"
        >
          <Avatar className="w-16 h-16 border-2 border-primary/30">
            <AvatarImage src={participant.profile?.avatar_url ?? undefined} />
            <AvatarFallback className="text-lg">{name[0].toUpperCase()}</AvatarFallback>
          </Avatar>
        </motion.div>
        {participant.is_muted && (
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
            <MicOff className="w-3 h-3 text-white" />
          </div>
        )}
        {participant.hand_raised && (
          <div className="absolute -top-1 -right-1 text-sm">✋</div>
        )}
        {participant.role === 'host' && (
          <div className="absolute -top-1 -left-1">
            <Crown className="w-4 h-4 text-yellow-400" />
          </div>
        )}
      </div>
      <span className="text-xs text-foreground text-center max-w-[72px] truncate">{name}</span>
      {canManage && participant.role !== 'host' && (
        <div className="flex gap-1">
          {participant.role === 'listener' ? (
            <button onClick={() => onPromote?.(participant.user_id)}
              className="text-[10px] text-primary border border-primary/40 px-2 py-0.5 rounded-full">
              Дать слово
            </button>
          ) : (
            <button onClick={() => onDemote?.(participant.user_id)}
              className="text-[10px] text-muted-foreground border border-border px-2 py-0.5 rounded-full">
              Убрать
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function AudioRoomView({ roomId }: AudioRoomViewProps) {
  const navigate = useNavigate();
  const {
    room, participants, isHost, isSpeaker, isMuted,
    leaveRoom, requestToSpeak, promoteToSpeaker, demoteToListener, endRoom, toggleMute
  } = useAudioRoom(roomId);

  const speakers = participants.filter(p => p.role === 'host' || p.role === 'speaker');
  const listeners = participants.filter(p => p.role === 'listener');

  const handleLeave = async () => {
    await leaveRoom();
    navigate('/audio-rooms');
  };

  const handleEnd = async () => {
    await endRoom();
    navigate('/audio-rooms');
  };

  if (!room) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-border">
        <button onClick={() => navigate('/audio-rooms')}>
          <ChevronDown className="w-6 h-6 text-muted-foreground" />
        </button>
        <div className="text-center flex-1 mx-4">
          <p className="text-xs text-muted-foreground mb-0.5">
            {room.host?.full_name || room.host?.username}
          </p>
          <h2 className="font-semibold text-sm line-clamp-1">{room.title}</h2>
        </div>
        <div className="flex items-center gap-1.5 bg-red-500/15 px-2 py-1 rounded-full">
          <motion.div
            className="w-2 h-2 rounded-full bg-red-500"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
          <span className="text-red-500 text-xs font-semibold">LIVE</span>
        </div>
      </div>

      {/* Speakers grid */}
      <div className="flex-1 p-6">
        <p className="text-xs text-muted-foreground mb-4 uppercase tracking-wide">
          Выступают · {speakers.length}
        </p>
        <div className="grid grid-cols-3 gap-6 mb-8">
          <AnimatePresence>
            {speakers.map(sp => (
              <motion.div key={sp.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <SpeakerAvatar
                  participant={sp}
                  isHost={isHost}
                  canManage={isHost}
                  onPromote={promoteToSpeaker}
                  onDemote={demoteToListener}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Listeners */}
        {listeners.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide">
              Слушают · {listeners.length}
            </p>
            <div className="flex flex-wrap gap-3">
              {listeners.map(l => {
                const name = l.profile?.full_name || l.profile?.username || '?';
                return (
                  <div key={l.id} className="flex flex-col items-center gap-1">
                    <div className="relative">
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={l.profile?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-sm">{name[0].toUpperCase()}</AvatarFallback>
                      </Avatar>
                      {l.hand_raised && (
                        <div className="absolute -top-1 -right-1 text-xs">✋</div>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground max-w-[40px] truncate">{name}</span>
                    {isHost && l.hand_raised && (
                      <button onClick={() => promoteToSpeaker(l.user_id)}
                        className="text-[9px] text-primary border border-primary/40 px-1.5 py-0.5 rounded-full">
                        Дать слово
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Controls */}
      <div className="p-6 border-t border-border">
        <div className="flex items-center justify-around">
          {/* Mute/Unmute (only for speakers) */}
          {isSpeaker && (
            <button onClick={toggleMute}
              className={`flex flex-col items-center gap-1 w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                isMuted ? 'bg-muted' : 'bg-primary'
              }`}
            >
              {isMuted
                ? <MicOff className="w-6 h-6 text-muted-foreground" />
                : <Mic className="w-6 h-6 text-white" />
              }
            </button>
          )}

          {/* Raise hand (listeners only) */}
          {!isSpeaker && !isHost && (
            <button onClick={requestToSpeak}
              className="flex flex-col items-center gap-1">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                <Hand className="w-6 h-6 text-foreground" />
              </div>
              <span className="text-xs text-muted-foreground">Поднять руку</span>
            </button>
          )}

          {/* End room (host only) */}
          {isHost && (
            <Button variant="destructive" size="sm" onClick={handleEnd}>
              Завершить
            </Button>
          )}

          {/* Leave */}
          <button onClick={handleLeave}
            className="flex flex-col items-center gap-1">
            <div className="w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center">
              <LogOut className="w-6 h-6 text-red-500" />
            </div>
            <span className="text-xs text-muted-foreground">Выйти</span>
          </button>
        </div>
      </div>
    </div>
  );
}
