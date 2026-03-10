/**
 * ui-store.ts — Zustand store для UI состояния видеоредактора.
 *
 * Панели, модалки, preview-режим, активные табы.
 * Отделён от editor-store и timeline-store для независимых ререндеров.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_BOTTOM_PANEL_HEIGHT,
  MIN_BOTTOM_PANEL_HEIGHT,
  MAX_BOTTOM_PANEL_HEIGHT,
} from '../constants';

// ── Types ─────────────────────────────────────────────────────────────────

export type InspectorTab = 'properties' | 'effects' | 'keyframes' | 'text' | 'audio';
export type MediaTab = 'media' | 'music' | 'stickers' | 'templates' | 'text';
export type PreviewMode = 'fit' | 'fill' | '100%';

export interface UIState {
  // Панели
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  bottomPanelHeight: number;

  // Активные табы
  activeInspectorTab: InspectorTab;
  activeMediaTab: MediaTab;

  // Модалки
  isRenderDialogOpen: boolean;
  isExportSettingsOpen: boolean;
  isProjectSettingsOpen: boolean;

  // Preview
  previewMode: PreviewMode;
  showSafeZones: boolean;
  showGrid: boolean;

  // Actions
  toggleLeftPanel(): void;
  toggleRightPanel(): void;
  setBottomPanelHeight(height: number): void;
  setActiveInspectorTab(tab: InspectorTab): void;
  setActiveMediaTab(tab: MediaTab): void;
  openRenderDialog(): void;
  closeRenderDialog(): void;
  openExportSettings(): void;
  closeExportSettings(): void;
  toggleProjectSettings(): void;
  setPreviewMode(mode: PreviewMode): void;
  toggleSafeZones(): void;
  toggleGrid(): void;
}

// ── Store ─────────────────────────────────────────────────────────────────

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Defaults
      leftPanelOpen: true,
      rightPanelOpen: true,
      bottomPanelHeight: DEFAULT_BOTTOM_PANEL_HEIGHT,

      activeInspectorTab: 'properties',
      activeMediaTab: 'media',

      isRenderDialogOpen: false,
      isExportSettingsOpen: false,
      isProjectSettingsOpen: false,

      previewMode: 'fit',
      showSafeZones: false,
      showGrid: false,

      // Panel toggles
      toggleLeftPanel() {
        set((s) => ({ leftPanelOpen: !s.leftPanelOpen }));
      },

      toggleRightPanel() {
        set((s) => ({ rightPanelOpen: !s.rightPanelOpen }));
      },

      setBottomPanelHeight(height) {
        set({
          bottomPanelHeight: Math.max(
            MIN_BOTTOM_PANEL_HEIGHT,
            Math.min(MAX_BOTTOM_PANEL_HEIGHT, height),
          ),
        });
      },

      // Tab switching
      setActiveInspectorTab(tab) {
        set({ activeInspectorTab: tab, rightPanelOpen: true });
      },

      setActiveMediaTab(tab) {
        set({ activeMediaTab: tab, leftPanelOpen: true });
      },

      // Modals
      openRenderDialog() {
        set({ isRenderDialogOpen: true });
      },

      closeRenderDialog() {
        set({ isRenderDialogOpen: false });
      },

      openExportSettings() {
        set({ isExportSettingsOpen: true });
      },

      closeExportSettings() {
        set({ isExportSettingsOpen: false });
      },

      toggleProjectSettings() {
        set((s) => ({ isProjectSettingsOpen: !s.isProjectSettingsOpen }));
      },

      // Preview
      setPreviewMode(mode) {
        set({ previewMode: mode });
      },

      toggleSafeZones() {
        set((s) => ({ showSafeZones: !s.showSafeZones }));
      },

      toggleGrid() {
        set((s) => ({ showGrid: !s.showGrid }));
      },
    }),
    {
      name: 'editor-ui-store',
      // Сохраняем только layout-preferences, не модалки
      partialize: (state) => ({
        leftPanelOpen: state.leftPanelOpen,
        rightPanelOpen: state.rightPanelOpen,
        bottomPanelHeight: state.bottomPanelHeight,
        previewMode: state.previewMode,
        showSafeZones: state.showSafeZones,
        showGrid: state.showGrid,
      }),
    },
  ),
);
