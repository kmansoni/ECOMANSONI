/**
 * editor-store.ts — Главный Zustand store проекта видеоредактора.
 *
 * Хранит полное дерево проекта (project + tracks + clips + effects + keyframes).
 * Все мутации immutable (spread). Оптимистичные обновления для мгновенного UI.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  EditorProject,
  EditorTrack,
  EditorClip,
  EditorEffect,
  EditorKeyframe,
  TrackWithClips,
  ClipWithDetails,
  ReorderItem,
} from '../types';

// ── Interface ─────────────────────────────────────────────────────────────

export interface EditorState {
  /** Текущий открытый проект. null если редактор пуст. */
  project: EditorProject | null;
  /** Дерево дорожек с вложенными клипами, эффектами и кейфреймами. */
  tracks: TrackWithClips[];
  /** Флаг, что в store есть несохранённые изменения. */
  isDirty: boolean;

  // ── Project actions ─────────────────────────────────────────────────────
  setProject(project: EditorProject, tracks: TrackWithClips[]): void;
  clearProject(): void;
  updateProjectLocal(updates: Partial<EditorProject>): void;
  markClean(): void;

  // ── Track actions ───────────────────────────────────────────────────────
  addTrackLocal(track: TrackWithClips): void;
  updateTrackLocal(trackId: string, updates: Partial<EditorTrack>): void;
  removeTrackLocal(trackId: string): void;
  reorderTracksLocal(items: ReorderItem[]): void;

  // ── Clip actions ────────────────────────────────────────────────────────
  addClipLocal(trackId: string, clip: ClipWithDetails): void;
  updateClipLocal(clipId: string, updates: Partial<EditorClip>): void;
  removeClipLocal(clipId: string): void;
  moveClipLocal(clipId: string, newTrackId: string, newStartMs: number): void;

  // ── Effect actions ──────────────────────────────────────────────────────
  addEffectLocal(clipId: string, effect: EditorEffect): void;
  updateEffectLocal(effectId: string, updates: Partial<EditorEffect>): void;
  removeEffectLocal(effectId: string): void;

  // ── Keyframe actions ────────────────────────────────────────────────────
  setKeyframesLocal(clipId: string, keyframes: EditorKeyframe[]): void;
  removeKeyframeLocal(keyframeId: string): void;

  // ── Computed ────────────────────────────────────────────────────────────
  getClipById(clipId: string): ClipWithDetails | undefined;
  getTrackById(trackId: string): TrackWithClips | undefined;
  getTrackByClipId(clipId: string): TrackWithClips | undefined;
  getProjectDuration(): number;
  getAllClipEdges(): number[];
}

// ── Store Implementation ──────────────────────────────────────────────────

export const useEditorStore = create<EditorState>()(
  subscribeWithSelector((set, get) => ({
    project: null,
    tracks: [],
    isDirty: false,

    // ── Project ───────────────────────────────────────────────────────────

    setProject(project, tracks) {
      set({ project, tracks, isDirty: false });
    },

    clearProject() {
      set({ project: null, tracks: [], isDirty: false });
    },

    updateProjectLocal(updates) {
      set((state) => {
        if (!state.project) return state;
        return {
          project: { ...state.project, ...updates },
          isDirty: true,
        };
      });
    },

    markClean() {
      set({ isDirty: false });
    },

    // ── Tracks ────────────────────────────────────────────────────────────

    addTrackLocal(track) {
      set((state) => ({
        tracks: [...state.tracks, track],
        isDirty: true,
      }));
    },

    updateTrackLocal(trackId, updates) {
      set((state) => ({
        tracks: state.tracks.map((t) =>
          t.id === trackId ? { ...t, ...updates } : t,
        ),
        isDirty: true,
      }));
    },

    removeTrackLocal(trackId) {
      set((state) => ({
        tracks: state.tracks.filter((t) => t.id !== trackId),
        isDirty: true,
      }));
    },

    reorderTracksLocal(items) {
      set((state) => {
        const orderMap = new Map(items.map((i) => [i.id, i.sort_order]));
        const updated = state.tracks.map((t) => {
          const newOrder = orderMap.get(t.id);
          return newOrder !== undefined ? { ...t, sort_order: newOrder } : t;
        });
        updated.sort((a, b) => a.sort_order - b.sort_order);
        return { tracks: updated, isDirty: true };
      });
    },

    // ── Clips ─────────────────────────────────────────────────────────────

    addClipLocal(trackId, clip) {
      set((state) => ({
        tracks: state.tracks.map((t) =>
          t.id === trackId
            ? { ...t, clips: [...t.clips, clip] }
            : t,
        ),
        isDirty: true,
      }));
    },

    updateClipLocal(clipId, updates) {
      set((state) => ({
        tracks: state.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, ...updates } : c,
          ),
        })),
        isDirty: true,
      }));
    },

    removeClipLocal(clipId) {
      set((state) => ({
        tracks: state.tracks.map((t) => ({
          ...t,
          clips: t.clips.filter((c) => c.id !== clipId),
        })),
        isDirty: true,
      }));
    },

    moveClipLocal(clipId, newTrackId, newStartMs) {
      set((state) => {
        let movedClip: ClipWithDetails | undefined;

        // Удалить клип из текущей дорожки
        const tracksWithoutClip = state.tracks.map((t) => {
          const clip = t.clips.find((c) => c.id === clipId);
          if (clip) {
            movedClip = { ...clip, track_id: newTrackId, start_ms: newStartMs };
            return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
          }
          return t;
        });

        if (!movedClip) return state;

        // Добавить в целевую дорожку
        const tracksWithClip = tracksWithoutClip.map((t) =>
          t.id === newTrackId
            ? { ...t, clips: [...t.clips, movedClip!] }
            : t,
        );

        return { tracks: tracksWithClip, isDirty: true };
      });
    },

    // ── Effects ───────────────────────────────────────────────────────────

    addEffectLocal(clipId, effect) {
      set((state) => ({
        tracks: state.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId
              ? { ...c, effects: [...c.effects, effect] }
              : c,
          ),
        })),
        isDirty: true,
      }));
    },

    updateEffectLocal(effectId, updates) {
      set((state) => ({
        tracks: state.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => ({
            ...c,
            effects: c.effects.map((e) =>
              e.id === effectId ? { ...e, ...updates } : e,
            ),
          })),
        })),
        isDirty: true,
      }));
    },

    removeEffectLocal(effectId) {
      set((state) => ({
        tracks: state.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => ({
            ...c,
            effects: c.effects.filter((e) => e.id !== effectId),
          })),
        })),
        isDirty: true,
      }));
    },

    // ── Keyframes ─────────────────────────────────────────────────────────

    setKeyframesLocal(clipId, keyframes) {
      set((state) => ({
        tracks: state.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, keyframes } : c,
          ),
        })),
        isDirty: true,
      }));
    },

    removeKeyframeLocal(keyframeId) {
      set((state) => ({
        tracks: state.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => ({
            ...c,
            keyframes: c.keyframes.filter((k) => k.id !== keyframeId),
          })),
        })),
        isDirty: true,
      }));
    },

    // ── Computed (read-only selectors) ────────────────────────────────────

    getClipById(clipId) {
      for (const track of get().tracks) {
        const found = track.clips.find((c) => c.id === clipId);
        if (found) return found;
      }
      return undefined;
    },

    getTrackById(trackId) {
      return get().tracks.find((t) => t.id === trackId);
    },

    getTrackByClipId(clipId) {
      return get().tracks.find((t) => t.clips.some((c) => c.id === clipId));
    },

    getProjectDuration() {
      const { tracks } = get();
      let maxEnd = 0;
      for (const track of tracks) {
        for (const clip of track.clips) {
          const end = clip.start_ms + clip.duration_ms;
          if (end > maxEnd) maxEnd = end;
        }
      }
      return maxEnd;
    },

    getAllClipEdges() {
      const edges = new Set<number>();
      for (const track of get().tracks) {
        for (const clip of track.clips) {
          edges.add(clip.start_ms);
          edges.add(clip.start_ms + clip.duration_ms);
        }
      }
      return Array.from(edges).sort((a, b) => a - b);
    },
  })),
);
