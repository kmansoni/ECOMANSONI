import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Camera,
  Settings,
  Users,
  X,
  ChevronLeft,
  Tag,
  AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { LiveBadge } from '@/components/live/LiveBadge';
import { ViewerCountBadge } from '@/components/live/ViewerCountBadge';
import { LiveChat } from '@/components/live/LiveChat';
import { FloatingReactions } from '@/components/live/FloatingReactions';
import { LiveGuestPanel } from '@/components/live/LiveGuestPanel';
import { StreamSettingsSheet } from '@/components/live/StreamSettingsSheet';
import { InviteGuestSheet } from '@/components/live/InviteGuestSheet';
import { PostStreamSummary } from '@/components/live/PostStreamSummary';
import { useLivestreamStore } from '@/stores/livestreamStore';
import { useLiveChat } from '@/hooks/useLiveChat';
import { useLiveReactions } from '@/hooks/useLiveReactions';
import { useLiveViewers } from '@/hooks/useLiveViewers';
import { useLiveHeartbeat } from '@/hooks/useLiveHeartbeat';
import { useLiveKitRoom } from '@/hooks/useLiveKitRoom';
import {
  useCreateStream,
  useStartStream,
  useStopStream,
  useStreamAnalytics,
  useStreamKeys,
  useStreamGuests,
  useKickGuest,
  useInviteGuest,
} from '@/hooks/useLivestream';
import type { CreateStreamPayload } from '@/types/livestream';
import { cn } from '@/lib/utils';

const CATEGORIES = ['Gaming', 'Music', 'Talk Show', 'Education', 'Other'];

type Phase = 'setup' | 'live' | 'ended';

/**
 * GoLivePage — publisher stream management page.
 * Phases: setup → live → ended (summary).
 */
export default function GoLivePage() {
  const navigate = useNavigate();
  const store = useLivestreamStore();

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isMature, setIsMature] = useState(false);

  // UI state
  const [phase, setPhase] = useState<Phase>('setup');
  const [showSettings, setShowSettings] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  // Mutations
  const createStream = useCreateStream();
  const startStream = useStartStream();
  const stopStream = useStopStream();
  const kickGuest = useKickGuest();
  const inviteGuest = useInviteGuest();

  const sessionId = store.currentStream?.id ?? null;

  // Data hooks
  const { messages, pinnedMessage, sendMessage } = useLiveChat(
    phase === 'live' ? sessionId : null,
  );
  const { reactions, sendReaction } = useLiveReactions(
    phase === 'live' ? sessionId : null,
  );
  const { viewerCount } = useLiveViewers(phase === 'live' ? sessionId : null);
  const { data: analytics } = useStreamAnalytics(
    phase === 'ended' ? (sessionId ?? undefined) : undefined,
  );
  const { data: streamKeys } = useStreamKeys();
  const { data: guests = [] } = useStreamGuests(
    phase === 'live' ? (sessionId ?? undefined) : undefined,
  );

  // Heartbeat
  useLiveHeartbeat(sessionId, phase === 'live');

  // LiveKit token (publisher)
  const [lkToken, setLkToken] = useState<string | null>(null);
  const [lkUrl, setLkUrl] = useState<string | null>(null);

  const { isMicEnabled, isCameraEnabled, toggleMic, toggleCamera, switchCamera } =
    useLiveKitRoom({
      token: lkToken,
      serverUrl: lkUrl,
      role: 'publisher',
    });

  const videoRef = useRef<HTMLVideoElement>(null);
  const startedAtRef = useRef<string | null>(null);

  // Camera preview (setup phase)
  useEffect(() => {
    if (phase !== 'setup') return;
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => {/* permissions denied — silent */});
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [phase]);

  const handleStartLive = useCallback(async () => {
    if (!title.trim()) return;
    const payload: CreateStreamPayload = {
      title: title.trim(),
      description: description.trim() || undefined,
      category: category || undefined,
      tags,
      is_mature_content: isMature,
    };
    const session = await createStream.mutateAsync(payload);
    store.setCurrentStream(session);
    const started = await startStream.mutateAsync(session.id);
    store.setCurrentStream(started);
    startedAtRef.current = started.actual_start_at ?? new Date().toISOString();
    setPhase('live');
  }, [title, description, category, tags, isMature, createStream, startStream, store]);

  const handleEndStream = useCallback(async () => {
    if (!sessionId) return;
    await stopStream.mutateAsync(sessionId);
    setPhase('ended');
  }, [sessionId, stopStream]);

  const handleTagKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
        e.preventDefault();
        const tag = tagInput.trim().replace(/^#/, '');
        if (tag && !tags.includes(tag) && tags.length < 5) {
          setTags((t) => [...t, tag]);
        }
        setTagInput('');
      }
    },
    [tagInput, tags],
  );

  const activeStreamKey = streamKeys?.[0];

  // ── Setup phase ─────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="relative min-h-screen bg-black text-white">
        {/* Camera preview background */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover opacity-50"
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80" />

        {/* Header */}
        <div className="relative z-10 flex items-center p-4 pt-safe-top">
          <button
            onClick={() => navigate(-1)}
            className="mr-3 rounded-full p-2 bg-black/40 hover:bg-black/60"
            aria-label="Go back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold flex-1">Создать эфир</h1>
          <button
            onClick={() => setShowSettings(true)}
            className="rounded-full p-2 bg-black/40 hover:bg-black/60"
            aria-label="Stream settings"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <div className="relative z-10 mt-auto px-4 pb-10 space-y-4 max-w-md mx-auto">
          {/* Title input */}
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название эфира…"
            maxLength={80}
            className="bg-black/50 border-white/20 text-white text-base font-medium placeholder:text-white/40 backdrop-blur-sm"
            aria-label="Stream title"
          />

          {/* Description */}
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Описание (необязательно)"
            rows={2}
            maxLength={300}
            className="bg-black/50 border-white/20 text-white text-sm placeholder:text-white/40 backdrop-blur-sm resize-none"
            aria-label="Stream description"
          />

          {/* Category */}
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="bg-black/50 border-white/20 text-white backdrop-blur-sm">
              <SelectValue placeholder="Категория" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Tags */}
          <div>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="bg-white/10 text-white gap-1 cursor-pointer"
                  onClick={() => setTags((t) => t.filter((x) => x !== tag))}
                >
                  #{tag} <X className="h-2.5 w-2.5" aria-hidden />
                </Badge>
              ))}
            </div>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" aria-hidden />
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Добавить тег (Enter)"
                disabled={tags.length >= 5}
                className="pl-9 bg-black/50 border-white/20 text-white text-sm placeholder:text-white/40 backdrop-blur-sm"
                aria-label="Add tag"
              />
            </div>
          </div>

          {/* 18+ toggle */}
          <div className="flex items-center justify-between rounded-xl bg-black/40 px-4 py-3 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-400" aria-hidden />
              <span className="text-sm">Контент 18+</span>
            </div>
            <Switch
              checked={isMature}
              onCheckedChange={setIsMature}
              aria-label="Mature content toggle"
            />
          </div>

          {/* Camera / mic controls */}
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => store.toggleCamera()}
              className={cn(
                'rounded-full p-3 transition-colors',
                store.isCameraEnabled ? 'bg-white/20 hover:bg-white/30' : 'bg-red-600/80 hover:bg-red-500/80',
              )}
              aria-label={store.isCameraEnabled ? 'Disable camera' : 'Enable camera'}
            >
              {store.isCameraEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </button>
            <button
              onClick={() => store.toggleMic()}
              className={cn(
                'rounded-full p-3 transition-colors',
                store.isMicEnabled ? 'bg-white/20 hover:bg-white/30' : 'bg-red-600/80 hover:bg-red-500/80',
              )}
              aria-label={store.isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
            >
              {store.isMicEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </button>
            <button
              onClick={() => void switchCamera()}
              className="rounded-full p-3 bg-white/20 hover:bg-white/30 transition-colors"
              aria-label="Switch camera"
            >
              <Camera className="h-5 w-5" />
            </button>
          </div>

          {/* Start button */}
          <motion.button
            onClick={() => void handleStartLive()}
            disabled={!title.trim() || createStream.isPending || startStream.isPending}
            animate={{ scale: [1, 1.03, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="w-full rounded-full bg-red-600 py-4 text-lg font-bold text-white shadow-lg disabled:opacity-50 disabled:animate-none"
            aria-label="Start live stream"
          >
            {createStream.isPending || startStream.isPending ? 'Запуск…' : '🔴 Начать эфир'}
          </motion.button>
        </div>

        <StreamSettingsSheet
          open={showSettings}
          onOpenChange={setShowSettings}
          streamKey={activeStreamKey?.stream_key}
          settings={store.streamSettings}
          onUpdateSettings={store.updateStreamSettings}
        />
      </div>
    );
  }

  // ── Ended phase ──────────────────────────────────────────────────────────────
  if (phase === 'ended') {
    const durationSec = startedAtRef.current
      ? Math.floor((Date.now() - new Date(startedAtRef.current).getTime()) / 1000)
      : 0;

    return (
      <div className="min-h-screen bg-zinc-950 text-white p-4 pt-safe-top">
        <div className="max-w-md mx-auto">
          <PostStreamSummary
            analytics={
              analytics ?? {
                peak_viewers: store.currentStream?.max_viewers ?? 0,
                total_unique_viewers: store.currentStream?.total_viewers ?? 0,
                total_chat_messages: 0,
                total_reactions: 0,
                total_donations_amount: 0,
                total_donations_count: 0,
                avg_watch_duration_sec: 0,
                viewer_retention_curve: [],
                chat_activity_curve: [],
                top_chatters: [],
                device_breakdown: {},
                geo_breakdown: {},
                new_followers_during_stream: 0,
                shares_count: 0,
              }
            }
            durationSec={durationSec}
            hasRecording={store.currentStream?.is_replay_available ?? false}
            onGoToRecording={() => navigate(`/live/${sessionId}/replay`)}
            onShare={() => void navigator.share?.({ title: 'Мой эфир завершён', url: window.location.origin })}
            onNewStream={() => {
              store.reset();
              setPhase('setup');
            }}
          />
        </div>
      </div>
    );
  }

  // ── Live phase ───────────────────────────────────────────────────────────────
  return (
    <div className="relative h-screen bg-black overflow-hidden">
      {/* Video background placeholder */}
      <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center">
        <Video className="h-24 w-24 text-zinc-700" aria-hidden />
      </div>

      {/* Top overlay */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between p-4 pt-safe-top bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex items-center gap-2">
          <LiveBadge size="large" startedAt={startedAtRef.current} />
          <ViewerCountBadge count={viewerCount} />
        </div>
        <div className="flex items-center gap-2">
          {/* Switch camera */}
          <button
            onClick={() => void switchCamera()}
            className="rounded-full p-2 bg-black/40 hover:bg-black/60"
            aria-label="Switch camera"
          >
            <Camera className="h-5 w-5 text-white" />
          </button>
          {/* Mic */}
          <button
            onClick={() => void toggleMic()}
            className={cn(
              'rounded-full p-2',
              isMicEnabled ? 'bg-black/40 hover:bg-black/60' : 'bg-red-600',
            )}
            aria-label={isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
          >
            {isMicEnabled ? <Mic className="h-5 w-5 text-white" /> : <MicOff className="h-5 w-5 text-white" />}
          </button>
          {/* Invite */}
          <button
            onClick={() => setShowInvite(true)}
            className="rounded-full p-2 bg-black/40 hover:bg-black/60"
            aria-label="Invite guest"
          >
            <Users className="h-5 w-5 text-white" />
          </button>
          {/* End stream */}
          <button
            onClick={() => setShowEndConfirm(true)}
            className="rounded-full p-2 bg-red-600 hover:bg-red-500"
            aria-label="End stream"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>
      </div>

      {/* Guest panel */}
      {guests.length > 0 && (
        <div className="absolute top-20 right-4 z-10 w-40">
          <LiveGuestPanel
            guests={guests}
            isHost
            onRemoveGuest={(guestId) =>
              void kickGuest.mutateAsync({ sessionId: sessionId!, guestId })
            }
            onInviteGuest={() => setShowInvite(true)}
          />
        </div>
      )}

      {/* Floating reactions */}
      <FloatingReactions reactions={reactions} />

      {/* Bottom overlay — chat */}
      <div className="absolute bottom-0 inset-x-0 z-20 bg-gradient-to-t from-black/80 to-transparent pt-12">
        <LiveChat
          messages={messages}
          pinnedMessage={pinnedMessage}
          onSend={sendMessage}
          className="h-64"
        />
      </div>

      {/* End stream confirmation */}
      <AlertDialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Завершить эфир?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Зрители потеряют доступ к трансляции. Вы можете сохранить запись после завершения.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-600 text-white hover:bg-zinc-800">
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-500 text-white"
              onClick={() => void handleEndStream()}
            >
              Завершить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invite guest sheet */}
      <InviteGuestSheet
        open={showInvite}
        onOpenChange={setShowInvite}
        guests={guests}
        onInvite={async (userId) => {
          await inviteGuest.mutateAsync({ sessionId: sessionId!, userId });
        }}
        onCancel={async (guestId) => {
          await kickGuest.mutateAsync({ sessionId: sessionId!, guestId });
        }}
      />
    </div>
  );
}
