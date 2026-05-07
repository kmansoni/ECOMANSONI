import type { GlassTokens } from "@/components/ui/glass/glassTokens";

export type ThemeTokens = GlassTokens;
export type Theme = "dark" | "light";
export type Step = "phone" | "register" | "otp" | "qr" | "success";
export type Gender = "male" | "female";
export type EntityType = "individual" | "self_employed" | "entrepreneur" | "legal_entity";

export type ApiPayload = Record<string, unknown>;

export interface FlowState {
  step: Step;
  phone: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string;
  birthDate: string;
  gender: string;
  entityType: string;
  password: string;
  passwordConfirm: string;
  registerError: string;
  otp: string;
  loading: boolean;
  maskedEmail: string;
  otpCountdown: number;
}

export type FlowAction =
  | { type: "setPhone"; phone: string }
  | { type: "setEmail"; email: string }
  | {
      type: "setRegisterField";
      field: "firstName" | "lastName" | "middleName" | "birthDate" | "gender" | "entityType" | "password" | "passwordConfirm";
      value: string;
    }
  | { type: "setRegisterError"; error: string }
  | { type: "setOtp"; otp: string }
  | { type: "setMaskedEmail"; maskedEmail: string }
  | { type: "goto"; step: Step }
  | { type: "loading"; value: boolean }
  | { type: "setCountdown"; value: number }
  | { type: "reset" };

export interface PrimaryButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  icon?: React.ReactNode;
  type?: "button" | "submit";
}

export interface GlassInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  icon?: React.ReactNode;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  tokens: ThemeTokens;
}
