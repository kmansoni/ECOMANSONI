/**
 * WebLoginButton — Embeddable "Login with [AppName]" button
 *
 * Usage:
 *   <WebLoginButton
 *     botId="my-bot-id"
 *     redirectUrl="https://mysite.com/auth/callback"
 *     onAuth={(user) => handleLogin(user)}
 *   />
 *
 * Security:
 * - Popup origin validated in message handler
 * - state parameter generated client-side (CSRF guard)
 * - After popup posts data, caller should verify via /web-login-widget/verify
 */
import { logger } from "@/lib/logger";

import { useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

export interface WebLoginUser {
  id: string;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export interface WebLoginButtonProps {
  botId: string;
  redirectUrl: string;
  buttonText?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Called when user authorizes (user = null means denied) */
  onAuth: (user: WebLoginUser | null) => void;
  /** Override app base URL (defaults to current origin) */
  appUrl?: string;
}

// ── Popup dimensions ───────────────────────────────────────────────────────

const POPUP_WIDTH = 480;
const POPUP_HEIGHT = 640;

// ── Component ──────────────────────────────────────────────────────────────

export function WebLoginButton({
  botId,
  redirectUrl,
  buttonText = "Войти через Messenger",
  size = "md",
  className,
  onAuth,
  appUrl,
}: WebLoginButtonProps) {
  const popupRef = useRef<Window | null>(null);
  const messageHandlerRef = useRef<((e: MessageEvent) => void) | null>(null);
  const stateRef = useRef<string>("");

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (messageHandlerRef.current) {
        window.removeEventListener("message", messageHandlerRef.current);
      }
    };
  }, []);

  const handleClick = useCallback(() => {
    // Close existing popup if open
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.focus();
      return;
    }

    // Remove old message handler
    if (messageHandlerRef.current) {
      window.removeEventListener("message", messageHandlerRef.current);
    }

    // Generate CSRF state
    stateRef.current = crypto.randomUUID();

    const baseUrl = appUrl ?? window.location.origin;
    const trustedOrigin = (() => {
      try {
        return new URL(baseUrl).origin;
      } catch {
        return window.location.origin;
      }
    })();
    const params = new URLSearchParams({
      bot_id: botId,
      redirect_url: redirectUrl,
      state: stateRef.current,
    });
    const loginUrl = `${baseUrl}/auth/web-login?${params.toString()}`;

    // Center popup
    const left = Math.round(window.screenX + (window.outerWidth - POPUP_WIDTH) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2);

    popupRef.current = window.open(
      loginUrl,
      "messenger_login",
      `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},` +
        "toolbar=no,menubar=no,scrollbars=no,resizable=no,location=no,status=no"
    );

    if (!popupRef.current) {
      // Popup blocked — fall back to redirect
      window.location.href = loginUrl;
      return;
    }

    // Listen for auth result
    const handler = (event: MessageEvent) => {
      // Origin validation: must come from our app
      if (event.origin !== trustedOrigin) return;
      if (!event.data || event.data.type !== "messenger_auth") return;

      // CSRF guard: verify state echoed back from popup matches what we sent.
      // Without this check, a rogue page at the same origin (e.g. via XSS in a
      // subdomain or a compromised script) could post a crafted message with a
      // valid type but different auth data, hijacking the session.
      if (event.data.state !== stateRef.current) {
        logger.error("[WebLoginButton] state mismatch — possible CSRF; ignoring message");
        return;
      }

      window.removeEventListener("message", handler);
      messageHandlerRef.current = null;

      const user: WebLoginUser | null = event.data.user;
      onAuth(user);
    };

    messageHandlerRef.current = handler;
    window.addEventListener("message", handler);

    // Poll for popup close without auth (user closed without action)
    const pollClosed = setInterval(() => {
      if (popupRef.current?.closed) {
        clearInterval(pollClosed);
        if (messageHandlerRef.current) {
          window.removeEventListener("message", messageHandlerRef.current);
          messageHandlerRef.current = null;
          // Popup closed without auth — treat as deny
          // Deliberately NOT calling onAuth(null) here to avoid false denies
        }
      }
    }, 500);
  }, [botId, redirectUrl, onAuth, appUrl]);

  // ── Size variants ─────────────────────────────────────────────────────────

  const sizeClasses: Record<string, string> = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
  };

  const iconSize: Record<string, number> = { sm: 14, md: 16, lg: 20 };

  return (
    <Button
      type="button"
      onClick={handleClick}
      className={cn(
        "bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl",
        "flex items-center gap-2 transition-all duration-150",
        sizeClasses[size],
        className
      )}
    >
      {/* App icon */}
      <MessengerIcon size={iconSize[size]} />
      <span>{buttonText}</span>
    </Button>
  );
}

// ── MessengerIcon ──────────────────────────────────────────────────────────

function MessengerIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12 2C6.477 2 2 6.145 2 11.25c0 2.717 1.155 5.15 3.01 6.894V21l2.74-1.504A11.1 11.1 0 0012 19.75c5.523 0 10-4.145 10-8.75C22 6.145 17.523 2 12 2z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M6.5 14l4-4.5 2.5 2.5 4-4.5"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default WebLoginButton;
