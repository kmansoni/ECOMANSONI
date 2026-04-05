import { create } from 'zustand';

interface WizardState {
  productType: string | null;
  step: number;
  totalSteps: number;
  formData: Record<string, unknown>;
  draftId: string | null;
  isDirty: boolean;

  init: (productType: string, totalSteps: number, draftId?: string, formData?: Record<string, unknown>, step?: number) => void;
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  updateField: (name: string, value: unknown) => void;
  updateFields: (fields: Record<string, unknown>) => void;
  setDraftId: (id: string) => void;
  markClean: () => void;
  reset: () => void;
}

export const useInsuranceWizardStore = create<WizardState>((set) => ({
  productType: null,
  step: 1,
  totalSteps: 1,
  formData: {},
  draftId: null,
  isDirty: false,

  init: (productType, totalSteps, draftId, formData, step) =>
    set({ productType, totalSteps, draftId: draftId ?? null, formData: formData ?? {}, step: step ?? 1, isDirty: false }),

  setStep: (step) => set({ step }),
  nextStep: () => set((s) => ({ step: Math.min(s.step + 1, s.totalSteps) })),
  prevStep: () => set((s) => ({ step: Math.max(s.step - 1, 1) })),

  updateField: (name, value) =>
    set((s) => ({ formData: { ...s.formData, [name]: value }, isDirty: true })),

  updateFields: (fields) =>
    set((s) => ({ formData: { ...s.formData, ...fields }, isDirty: true })),

  setDraftId: (id) => set({ draftId: id }),
  markClean: () => set({ isDirty: false }),
  reset: () => set({ productType: null, step: 1, totalSteps: 1, formData: {}, draftId: null, isDirty: false }),
}));
