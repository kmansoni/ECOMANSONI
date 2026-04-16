import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera, CameraOff, FlipHorizontal, Video, VideoOff, Circle,
  Download, Share2, X, ImagePlus
} from 'lucide-react';
import { ARFilterStrip } from './ARFilterStrip';
import { type ARFilter } from '@/lib/ar/filters';
import { loadModel, detectFaces } from '@/lib/ar/faceDetection';
import { loadSegmentationModel, segmentPerson, applyBackgroundBlur } from '@/lib/ar/backgroundSegmentation';
import { logger } from '@/lib/logger';

interface ARFilterCameraProps {
  onCapture?: (dataUrl: string) => void;
  onClose?: () => void;
}

export function ARFilterCamera({ onCapture, onClose }: ARFilterCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const [selectedFilter, setSelectedFilter] = useState<ARFilter | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isRecording, setIsRecording] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedVideo, setCapturedVideo] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  const [bgBlur, setBgBlur] = useState(false);
  const facesRef = useRef<any[]>([]);

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: mode === 'video',
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraError(null);
    } catch (e) {
      setCameraError('Нет доступа к камере');
      logger.error('[ARFilterCamera] camera error', { error: e });
    }
  }, [facingMode, mode]);

  useEffect(() => {
    startCamera();
    // Lazy-load face detection and segmentation models
    void loadModel();
    void loadSegmentationModel();
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [startCamera]);

  // Render loop applying filter
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    let frameCount = 0;
    const draw = () => {
      void drawAsync();
    };
    const drawAsync = async () => {
      if (video.readyState >= 2) {
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          if (selectedFilter) {
            selectedFilter.apply(ctx, canvas.width, canvas.height);
          }
          // Face detection every 10 frames for performance
          if (frameCount % 10 === 0) {
            const faces = await detectFaces(video);
            facesRef.current = faces;
          }
          // Draw face bounding boxes (debug / mask positioning)
          if (selectedFilter && facesRef.current.length > 0) {
            facesRef.current.forEach(face => {
              const { x, y, width, height } = face.boundingBox;
              // Фильтры могут использовать координаты для позиционирования масок
              ctx.strokeStyle = 'rgba(255,255,255,0)'; // скрытые границы
              ctx.strokeRect(x, y, width, height);
            });
          }
          // Apply background blur if enabled
          if (bgBlur) {
            const mask = await segmentPerson(video);
            if (mask) {
              applyBackgroundBlur(canvas, mask, 8);
            }
          }
        }
      }
      frameCount++;
      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [selectedFilter, bgBlur]);

  const handleFlip = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const handleCapture = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedImage(dataUrl);
    onCapture?.(dataUrl);
  };

  const handleStartRecording = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    recordedChunksRef.current = [];
    const stream = canvas.captureStream(30);
    // Add audio if available
    streamRef.current?.getAudioTracks().forEach(t => stream.addTrack(t));
    const mr = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    mr.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setCapturedVideo(url);
    };
    mr.start();
    mediaRecorderRef.current = mr;
    setIsRecording(true);
  };

  const handleStopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const handleSave = () => {
    if (capturedImage) {
      const a = document.createElement('a');
      a.href = capturedImage;
      a.download = `photo_${Date.now()}.jpg`;
      a.click();
    } else if (capturedVideo) {
      const a = document.createElement('a');
      a.href = capturedVideo;
      a.download = `video_${Date.now()}.webm`;
      a.click();
    }
  };

  const handleShare = async () => {
    if (!capturedImage) return;
    try {
      const blob = await (await fetch(capturedImage)).blob();
      const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      }
    } catch (e) {
      logger.error('[ARFilterCamera] filter error', { error: e });
    }
  };

  const handleGallery = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => setCapturedImage(reader.result as string);
      reader.readAsDataURL(file);
    };
    input.click();
  };

  if (capturedImage || capturedVideo) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col">
        <div className="flex-1 relative">
          {capturedImage && (
            <img loading="lazy" src={capturedImage} className="w-full h-full object-contain" alt="Снимок" />
          )}
          {capturedVideo && (
            <video src={capturedVideo} controls className="w-full h-full object-contain" />
          )}
        </div>
        <div className="flex items-center justify-around p-6 bg-black">
          <button onClick={() => { setCapturedImage(null); setCapturedVideo(null); }}
            className="flex flex-col items-center gap-1 text-white">
            <X className="w-6 h-6" />
            <span className="text-xs">Отмена</span>
          </button>
          <button onClick={handleSave}
            className="flex flex-col items-center gap-1 text-white">
            <Download className="w-6 h-6" />
            <span className="text-xs">Сохранить</span>
          </button>
          <button onClick={handleShare}
            className="flex flex-col items-center gap-1 text-white">
            <Share2 className="w-6 h-6" />
            <span className="text-xs">Поделиться</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Video (hidden, used as source) */}
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />

      {/* Canvas preview */}
      <div className="flex-1 relative overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full object-cover" />

        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white text-center">
              <CameraOff className="w-12 h-12 mx-auto mb-2 opacity-60" />
              <p>{cameraError}</p>
            </div>
          </div>
        )}

        {/* Top controls */}
        <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between">
          {onClose && (
            <button onClick={onClose} className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center">
              <X className="w-5 h-5 text-white" />
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button onClick={handleGallery}
              className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center">
              <ImagePlus className="w-5 h-5 text-white" />
            </button>
            <button onClick={handleFlip}
              className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center">
              <FlipHorizontal className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Mode switch */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1 bg-black/40 rounded-full p-1">
          {(['photo', 'video'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-4 py-1 rounded-full text-sm font-medium transition-colors ${
                mode === m ? 'bg-white text-black' : 'text-white'
              }`}>
              {m === 'photo' ? 'Фото' : 'Видео'}
            </button>
          ))}
        </div>

        {/* Recording indicator */}
        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute top-16 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-red-600 px-3 py-1 rounded-full"
            >
              <motion.div
                className="w-2 h-2 rounded-full bg-white"
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              />
              <span className="text-white text-xs font-medium">REC</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Filter strip */}
      <ARFilterStrip selectedFilter={selectedFilter} onSelectFilter={setSelectedFilter} />

      {/* Capture button */}
      <div className="flex items-center justify-center py-6 bg-black">
        {mode === 'photo' ? (
          <motion.button
            onClick={handleCapture}
            whileTap={{ scale: 0.9 }}
            className="w-20 h-20 rounded-full border-4 border-white bg-white/20 flex items-center justify-center"
          >
            <Camera className="w-8 h-8 text-white" />
          </motion.button>
        ) : (
          <motion.button
            onClick={isRecording ? handleStopRecording : handleStartRecording}
            whileTap={{ scale: 0.9 }}
            className={`w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition-colors ${
              isRecording ? 'bg-red-600' : 'bg-white/20'
            }`}
          >
            {isRecording
              ? <VideoOff className="w-8 h-8 text-white" />
              : <Video className="w-8 h-8 text-white" />
            }
          </motion.button>
        )}
      </div>
    </div>
  );
}
