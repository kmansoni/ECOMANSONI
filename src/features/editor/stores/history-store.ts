/**
 * history-store.ts — Undo/Redo стек для видеоредактора.
 *
 * Каждая запись хранит пару замыканий (undo/redo) + человекочитаемый label.
 * Стек ограничен MAX_UNDO_STACK_SIZE записями для предотвращения утечки памяти.
 *
 * При push redo-стек очищается (стандартная семантика undo).
 */

import { create } from 'zustand';
import { MAX_UNDO_STACK_SIZE } from '../constants';

// ── Types ─────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  id: string;
  label: string;
  timestamp: number;
  undo: () => void;
  redo: () => void;
}

export interface HistoryState {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  maxStackSize: number;

  push(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;
}

// ── ID generator ──────────────────────────────────────────────────────────

let _historySeq = 0;
function nextId(): string {
  _historySeq += 1;
  return `hist_${_historySeq}_${Date.now()}`;
}

// ── Store ─────────────────────────────────────────────────────────────────

export const useHistoryStore = create<HistoryState>()((set, get) => ({
  undoStack: [],
  redoStack: [],
  maxStackSize: MAX_UNDO_STACK_SIZE,

  push(entry) {
    set((state) => {
      const full: HistoryEntry = {
        ...entry,
        id: nextId(),
        timestamp: Date.now(),
      };
      const newUndo = [...state.undoStack, full];
      // Trim oldest entries if exceeding max size
      if (newUndo.length > state.maxStackSize) {
        newUndo.splice(0, newUndo.length - state.maxStackSize);
      }
      return {
        undoStack: newUndo,
        redoStack: [], // Стандартная семантика: push очищает redo
      };
    });
  },

  undo() {
    const { undoStack } = get();
    if (undoStack.length === 0) return;

    const entry = undoStack[undoStack.length - 1];
    // Выполняем откат
    entry.undo();

    set((state) => ({
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, entry],
    }));
  },

  redo() {
    const { redoStack } = get();
    if (redoStack.length === 0) return;

    const entry = redoStack[redoStack.length - 1];
    // Выполняем повтор
    entry.redo();

    set((state) => ({
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, entry],
    }));
  },

  canUndo() {
    return get().undoStack.length > 0;
  },

  canRedo() {
    return get().redoStack.length > 0;
  },

  clear() {
    set({ undoStack: [], redoStack: [] });
  },
}));
