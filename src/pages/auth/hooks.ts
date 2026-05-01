import { useEffect, useReducer, useState } from "react";
import type { FlowState, FlowAction } from "./types";

const initialFlow: FlowState = {
  step: "phone",
  phone: "",
  email: "",
  firstName: "",
  lastName: "",
  middleName: "",
  birthDate: "",
  gender: "",
  entityType: "",
  password: "",
  passwordConfirm: "",
  registerError: "",
  otp: "",
  loading: false,
  maskedEmail: "",
  otpCountdown: 0,
};

function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "setPhone":
      return { ...state, phone: action.phone };
    case "setEmail":
      return { ...state, email: action.email };
    case "setRegisterField":
      return { ...state, [action.field]: action.value };
    case "setRegisterError":
      return { ...state, registerError: action.error };
    case "setOtp":
      return { ...state, otp: action.otp };
    case "setMaskedEmail":
      return { ...state, maskedEmail: action.maskedEmail };
    case "goto":
      return { ...state, step: action.step };
    case "loading":
      return { ...state, loading: action.value };
    case "setCountdown":
      return { ...state, otpCountdown: action.value };
    case "reset":
      return initialFlow;
    default:
      return state;
  }
}

export function useAuthFlow() {
  return useReducer(flowReducer, initialFlow);
}

export function useMediaFlag(query: string) {
  const [value, setValue] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const upd = () => setValue(m.matches);
    upd();
    m.addEventListener?.("change", upd);
    return () => m.removeEventListener?.("change", upd);
  }, [query]);
  return value;
}

export function useOtpCountdown(countdown: number, dispatch: React.Dispatch<FlowAction>) {
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => {
      dispatch({ type: "setCountdown", value: Math.max(0, countdown - 1) });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [countdown, dispatch]);
}
