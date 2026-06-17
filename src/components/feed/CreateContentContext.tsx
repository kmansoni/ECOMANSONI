import { createContext, useContext, type ReactNode } from 'react';
import type { CameraHostHandle, CaptureMode } from '@/components/camera/CameraHost';
import type { CameraDebugSnapshot } from '@/components/camera/CameraHost';
import type { GalleryMediaKind, GalleryPermissionState } from '@/features/create/gallery/galleryTypes';
import type { EditorState, EditorAction } from './editorStateModel';

export interface CreateContentContextValue {
  // ── App shell ────────────────────────────────────────────────
  activeTab: 'publications' | 'stories' | 'reels' | 'live';
  isPublishing: boolean;
  isLoading: boolean;
  handlePublish: () => void;
  handleClose: () => void;

  // ── Camera ────────────────────────────────────────────────────
  isCameraReady: boolean;
  isCameraRecording: boolean;
  timerCountdown: number | null;
  flashMode: 'off' | 'on' | 'auto' | 'screen';
  screenFlashActive: boolean;
  facingMode: 'user' | 'environment';
  zoomIndex: number;
  zoomLabel: string;
  captureTimerSec: number;
  showCameraSettings: boolean;
  cameraDebug: CameraDebugSnapshot | null;
  reelMaxRecordingMs: number;
  reelRecordingElapsedMs: number;
  cameraHostRef: React.RefObject<CameraHostHandle | null>;
  cycleFlash: () => void;
  cycleTimer: () => void;
  cycleZoom: () => void;
  setZoomLevelIndex: (index: number) => void;
  handleCapture: () => void;
  handleCameraReadyChange: (ready: boolean) => void;
  handleCameraDebugChange: (snapshot: CameraDebugSnapshot) => void;
  handleRecordingChange: (recording: boolean) => void;
  flipCamera: () => void;
  setShowCameraSettings: (v: boolean) => void;
  onPhotoCaptured: (file: File, url: string) => void;
  onVideoRecorded: (file: File, url: string) => void;
  onCameraError: (err: unknown) => void;

  // CameraHost raw props
  isActive: boolean;
  mode: CaptureMode;
  previewZoom: number;

  // ── Gallery ──────────────────────────────────────────────────
  galleryPermission: GalleryPermissionState;
  lastGalleryThumbnailUrl: string | null;
  lastGalleryMediaKind: GalleryMediaKind | null;
  openGalleryPicker: () => void;

  // ── Preview ──────────────────────────────────────────────────
  previewUrl: string | null;
  selectedFile: File | null;
  resetForm: () => void;
  setPreviewUrl: (url: string | null) => void;
  setSelectedFile: (file: File | null) => void;

  // ── Caption / editor ─────────────────────────────────────────
  showCaptionEditor: boolean;
  caption: string;
  editorState: EditorState;
  dispatchEditor: React.Dispatch<EditorAction>;
  setCaption: (v: string) => void;

  // ── Live ─────────────────────────────────────────────────────
  title: string;
  category: string;
  setTitle: (v: string) => void;
  setCategory: (v: string) => void;

  // ── Audio (QuickPanels) ───────────────────────────────────────
  quickPanel: 'audio' | 'effects' | null;
  setQuickPanel: (panel: 'audio' | 'effects' | null) => void;
  musicTitle: string;
  selectedMusicTrackId: string | null;
  setMusicTitle: (v: string) => void;
  setSelectedMusicTrackId: (id: string | null) => void;
  reelEffectPreset: string;
  setReelEffectPreset: (id: string) => void;

  // ── Text story ────────────────────────────────────────────────
  textStoryText: string;
  setTextStoryText: (v: string) => void;
  textStoryBackgroundId: string;
  setTextStoryBackgroundId: (id: string) => void;
  textStoryFontId: string;
  setTextStoryFontId: (id: string) => void;
  textStoryAlign: 'left' | 'center' | 'right';
  setTextStoryAlign: (a: 'left' | 'center' | 'right') => void;

  // ── Gallery picker (file input trigger) ───────────────────────
  galleryAccept: string;
  isCarouselMode: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const CreateContentContext = createContext<CreateContentContextValue | null>(null);

export function CreateContentProvider({
  value,
  children,
}: {
  value: CreateContentContextValue;
  children: ReactNode;
}) {
  return <CreateContentContext.Provider value={value}>{children}</CreateContentContext.Provider>;
}

export function useCreateContent(): CreateContentContextValue {
  const ctx = useContext(CreateContentContext);
  if (!ctx) throw new Error('useCreateContent must be used inside CreateContentProvider');
  return ctx;
}
