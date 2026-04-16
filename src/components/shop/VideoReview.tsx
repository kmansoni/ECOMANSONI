/**
 * VideoReview — запись/загрузка видео-отзыва на товар.
 *
 * Позволяет записать видео с камеры (лимит 60 сек) или загрузить файл.
 * Загружает в Supabase Storage, затем добавляет video_url к отзыву.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Video, Upload, StopCircle, Play, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, dbLoose } from "@/lib/supabase";
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';

interface VideoReviewProps {
  productId: string;
  reviewId?: string;
  onVideoUploaded?: (videoUrl: string) => void;
}

const MAX_DURATION_SEC = 60;
const MAX_FILE_SIZE_MB = 50;
const ACCEPTED_VIDEO_TYPES = 'video/mp4,video/webm,video/quicktime';

type RecordingState = 'idle' | 'recording' | 'recorded' | 'uploading';

export function VideoReview({ productId, reviewId, onVideoUploaded }: VideoReviewProps) {
  const { user } = useAuth();
  const [state, setState] = useState<RecordingState>('idle');
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      stopStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: true,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        await videoRef.current.play();
      }

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setVideoBlob(blob);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setState('recorded');
        stopStream();

        if (videoRef.current) {
          videoRef.current.srcObject = null;
          videoRef.current.src = url;
          videoRef.current.muted = false;
        }
      };

      recorder.start(1000);
      setState('recording');
      setElapsed(0);

      timerRef.current = setInterval(() => {
        setElapsed(prev => {
          if (prev >= MAX_DURATION_SEC - 1) {
            recorder.stop();
            if (timerRef.current) clearInterval(timerRef.current);
            return MAX_DURATION_SEC;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      logger.error('[VideoReview] Ошибка доступа к камере', { error: err });
      toast.error('Не удалось получить доступ к камере');
    }
  }, [stopStream]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast.error(`Максимальный размер файла: ${MAX_FILE_SIZE_MB} МБ`);
      return;
    }

    // Проверяем длительность видео
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.onloadedmetadata = () => {
      URL.revokeObjectURL(tempVideo.src);
      if (tempVideo.duration > MAX_DURATION_SEC) {
        toast.error(`Максимальная длительность: ${MAX_DURATION_SEC} секунд`);
        return;
      }
      setVideoBlob(file);
      const url = URL.createObjectURL(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
      setState('recorded');
    };
    tempVideo.src = URL.createObjectURL(file);
  }, [previewUrl]);

  const resetVideo = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setVideoBlob(null);
    setState('idle');
    setElapsed(0);
    setUploadProgress(0);
    stopStream();
  }, [previewUrl, stopStream]);

  const uploadVideo = useCallback(async () => {
    if (!videoBlob || !user) return;

    setState('uploading');
    setUploadProgress(0);

    try {
      const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
      const fileName = `reviews/${productId}/${user.id}_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('product-media')
        .upload(fileName, videoBlob, {
          contentType: videoBlob.type,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      setUploadProgress(70);

      const { data: urlData } = supabase.storage
        .from('product-media')
        .getPublicUrl(fileName);

      const videoUrl = urlData.publicUrl;

      // Если есть reviewId — прикрепляем к существующему отзыву
      if (reviewId) {
        const { error: updateError } = await dbLoose
          .from('product_reviews')
          .update({ video_url: videoUrl })
          .eq('id', reviewId);

        if (updateError) throw updateError;
      }

      setUploadProgress(100);
      onVideoUploaded?.(videoUrl);
      toast.success('Видео-отзыв загружен');
      resetVideo();
    } catch (err) {
      logger.error('[VideoReview] Ошибка загрузки видео', { error: err, productId });
      toast.error('Не удалось загрузить видео');
      setState('recorded');
    }
  }, [videoBlob, user, productId, reviewId, onVideoUploaded, resetVideo]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!user) return null;

  return (
    <div className="space-y-3">
      {/* Видео превью / камера */}
      {(state === 'recording' || state === 'recorded') && (
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-[9/16] max-h-[300px]">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            controls={state === 'recorded'}
          />

          {state === 'recording' && (
            <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-500/80 backdrop-blur-sm rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="text-white text-xs font-semibold tabular-nums">
                {formatTime(elapsed)} / {formatTime(MAX_DURATION_SEC)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Прогресс загрузки */}
      {state === 'uploading' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-zinc-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Загрузка видео... {uploadProgress}%</span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Кнопки управления */}
      <div className="flex gap-2">
        {state === 'idle' && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={startRecording}
              className="flex-1 gap-2 min-h-[44px]"
            >
              <Video className="w-4 h-4" />
              Записать видео
            </Button>

            <label className="flex-1">
              <input
                type="file"
                accept={ACCEPTED_VIDEO_TYPES}
                onChange={handleFileUpload}
                className="hidden"
                aria-label="Загрузить видео"
              />
              <Button
                variant="outline"
                size="sm"
                asChild
                className="w-full gap-2 min-h-[44px] cursor-pointer"
              >
                <span>
                  <Upload className="w-4 h-4" />
                  Загрузить файл
                </span>
              </Button>
            </label>
          </>
        )}

        {state === 'recording' && (
          <Button
            variant="destructive"
            size="sm"
            onClick={stopRecording}
            className="flex-1 gap-2 min-h-[44px]"
          >
            <StopCircle className="w-4 h-4" />
            Остановить ({formatTime(MAX_DURATION_SEC - elapsed)})
          </Button>
        )}

        {state === 'recorded' && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={resetVideo}
              className="gap-2 min-h-[44px]"
            >
              <Trash2 className="w-4 h-4" />
              Удалить
            </Button>

            <Button
              size="sm"
              onClick={uploadVideo}
              className="flex-1 gap-2 min-h-[44px]"
            >
              <Play className="w-4 h-4" />
              Опубликовать видео
            </Button>
          </>
        )}
      </div>

      <p className="text-xs text-zinc-500">
        Максимум {MAX_DURATION_SEC} сек, до {MAX_FILE_SIZE_MB} МБ. Форматы: MP4, WebM.
      </p>
    </div>
  );
}
