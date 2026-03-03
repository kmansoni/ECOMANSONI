import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Radio, ChevronLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { AudioRoomCard } from '@/components/audio/AudioRoomCard';
import { AudioRoomView } from '@/components/audio/AudioRoomView';
import { CreateAudioRoomSheet } from '@/components/audio/CreateAudioRoomSheet';
import { useAudioRooms, useAudioRoom } from '@/hooks/useAudioRoom';

function RoomListPage() {
  const navigate = useNavigate();
  const { liveRooms, scheduledRooms, loading } = useAudioRooms();
  const [createOpen, setCreateOpen] = useState(false);

  const handleJoin = async (roomId: string) => {
    navigate(`/audio-rooms/${roomId}`);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold">Audio Rooms</h1>
            <p className="text-xs text-muted-foreground">Голосовые комнаты</p>
          </div>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          Создать
        </Button>
      </div>

      <div className="p-4 space-y-6">
        {/* Live rooms */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <motion.div
              className="w-2 h-2 rounded-full bg-red-500"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
            <h2 className="font-semibold">Сейчас в эфире</h2>
            <span className="text-muted-foreground text-sm">({liveRooms.length})</span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="h-28 bg-muted rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : liveRooms.length === 0 ? (
            <div className="bg-muted/50 rounded-2xl p-6 text-center">
              <Radio className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">Нет активных комнат</p>
              <p className="text-muted-foreground text-xs mt-1">Создайте первую!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {liveRooms.map(room => (
                <AudioRoomCard
                  key={room.id}
                  room={room}
                  onClick={() => handleJoin(room.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Scheduled rooms */}
        {scheduledRooms.length > 0 && (
          <section>
            <h2 className="font-semibold mb-3">Запланированные</h2>
            <div className="space-y-3">
              {scheduledRooms.map(room => (
                <AudioRoomCard
                  key={room.id}
                  room={room}
                  onClick={() => handleJoin(room.id)}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      <CreateAudioRoomSheet open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function RoomDetailPage({ roomId }: { roomId: string }) {
  const { joinRoom } = useAudioRoom();

  React.useEffect(() => {
    joinRoom(roomId);
  }, [roomId]); // eslint-disable-line

  return <AudioRoomView roomId={roomId} />;
}

export function AudioRoomsPage() {
  const { roomId } = useParams<{ roomId?: string }>();

  if (roomId) {
    return <RoomDetailPage roomId={roomId} />;
  }

  return <RoomListPage />;
}
