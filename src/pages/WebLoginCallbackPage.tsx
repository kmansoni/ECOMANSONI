/**
 * WebLoginCallbackPage — /auth/web-login
 *
 * Displayed inside a popup opened by the Web Login Widget.
 * Shows the requesting site's details and prompts user to Allow/Deny.
 *
 * Flow:
 * 1. Page receives ?session_id=X from URL params
 * 2. Fetches session details from edge function
 * 3. Renders requesting site + requested permissions
 * 4. On "Allow" → calls /web-login-widget/callback to finalize session
 *    → posts auth data to parent window → closes popup
 * 5. On "Deny" → marks session denied → posts null → closes popup
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getSupabaseRuntimeConfig } from "@/lib/supabaseRuntimeConfig";
import {
  SpinnerIcon,
  VerifiedIcon,
  GlobeIcon,
  UserIcon,
  AtSignIcon,
  ImageSquareIcon,
  type AppIconProps,
} from "@/components/ui/app-icons";
import {
  AppPageShell,
  AppGlassCard,
  AppPrimaryButton,
  AppSecondaryButton,
} from "@/components/ui/app-shell";

// ── Types ──────────────────────────────────────────────────────────────────

interface SessionInfo {
  session_id: string;
  bot_id: string;
  site_name: string;
  site_icon?: string;
  redirect_url: string;
  state: string;
  /** Which user fields will be shared */
  requested_scopes: string[];
}

interface AuthUser {
  id: string;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-login-widget`;
const EDGE_APIKEY = String(getSupabaseRuntimeConfig().supabasePublishableKey || "").trim();

// ── Scope display ──────────────────────────────────────────────────────────

const SCOPE_LABELS: Record<string, { label: string; icon: (props: AppIconProps) => React.ReactNode }> = {
  name: { label: "Имя и фамилия", icon: UserIcon },
  username: { label: "Username (@имя)", icon: AtSignIcon },
  photo: { label: "Фото профиля", icon: ImageSquareIcon },
};

// ── Component ──────────────────────────────────────────────────────────────

export function WebLoginCallbackPage() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const metaFullName = typeof user?.user_metadata?.full_name === "string"
    ? user.user_metadata.full_name.trim()
    : "";
  const metaUsername = typeof user?.user_metadata?.username === "string"
    ? user.user_metadata.username.trim()
    : "";
  const metaAvatarUrl = typeof user?.user_metadata?.avatar_url === "string"
    ? user.user_metadata.avatar_url.trim()
    : "";
  const fallbackName = metaFullName || user?.email?.split("@")[0] || "User";
  const initials = fallbackName.slice(0, 2).toUpperCase();

  const sessionId = searchParams.get("session_id");
  const botId = searchParams.get("bot_id");
  const redirectUrl = searchParams.get("redirect_url");
  const state = searchParams.get("state") ?? "";

  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  /**
   * Post auth result to the opener window.
   *
   * Security: targetOrigin is restricted to the registered redirect_url's origin
   * (or our own origin if sessionInfo is not yet loaded) so that the auth token
   * (hash field) is only delivered to the requesting site — not to any page that
   * happens to have opened the popup.
   *
   * Using "*" here would allow any opener to receive the HMAC-signed user data,
   * which is equivalent to leaking the session token.
   */
  /**
   * Post auth result to the opener window.
   *
   * Security: targetOrigin is restricted to the registered redirect_url's origin
   * (or our own origin if sessionInfo is not yet loaded) so that the auth token
   * (hash field) is only delivered to the requesting site — not to any page that
   * happens to have opened the popup.
   *
   * Using "*" here would allow any opener to receive the HMAC-signed user data,
   * which is equivalent to leaking the session token.
   *
   * Implementation note: we use a useRef+useCallback pair so that the init effect
   * below can always call the *latest* version of sendToParent (with up-to-date
   * sessionInfo) without listing it as a reactive dependency — preventing an
   * infinite re-run loop that would otherwise occur when sessionInfo is set.
   */
  const sendToParent = useCallback((authData: AuthUser | null, redirectUrlOverride?: string, stateOverride?: string) => {
    if (window.opener) {
      let targetOrigin = window.location.origin; // safe fallback = same origin
      const resolvedRedirectUrl = redirectUrlOverride ?? sessionInfo?.redirect_url;
      if (resolvedRedirectUrl) {
        try {
          targetOrigin = new URL(resolvedRedirectUrl).origin;
        } catch (_err) {
          // malformed redirect_url — fall back to same-origin
        }
      }
      // Include the state value so the opener can verify CSRF state matches.
      window.opener.postMessage(
        { type: "messenger_auth", user: authData, state: stateOverride ?? sessionInfo?.state ?? "" },
        targetOrigin
      );
    }
    setTimeout(() => window.close(), 300);
  }, [sessionInfo?.redirect_url, sessionInfo?.state]);

  // Always-fresh ref so the init effect below can call sendToParent without
  // including it in the deps array (which would trigger an infinite loop).
  const sendToParentRef = useRef(sendToParent);
  sendToParentRef.current = sendToParent;

  // Resolve session info
  useEffect(() => {
    if (!sessionId && !botId) {
      setError("Неверная ссылка авторизации");
      setLoading(false);
      return;
    }

    // If session_id provided, fetch from edge function
    // If bot_id + redirect_url provided (direct embed), create a session
    const init = async () => {
      if (sessionId) {
        const res = await fetch(
          `${EDGE_FUNCTION_URL}/callback?session_id=${encodeURIComponent(sessionId)}`,
          {
            method: "GET",
            headers: {
              ...(EDGE_APIKEY ? { apikey: EDGE_APIKEY } : {}),
            },
          }
        );
        const data = await res.json();
        if (!res.ok || data.error) {
          setError(data.error ?? "Сессия недействительна");
          setLoading(false);
          return;
        }
        // For pre-authorized sessions, just close with data
        if (data.status === "authorized" && data.auth_data) {
          sendToParentRef.current(data.auth_data, data.redirect_url ?? redirectUrl ?? undefined, data.state ?? state);
          setDone(true);
          setLoading(false);
          return;
        }
        // Session is pending — show UI
        setSessionInfo({
          session_id: sessionId,
          bot_id: data.bot_id ?? botId ?? "",
          site_name: extractSiteName(data.redirect_url ?? redirectUrl ?? ""),
          redirect_url: data.redirect_url ?? redirectUrl ?? "",
          state: data.state ?? state,
          requested_scopes: ["name", "username", "photo"],
        });
        setLoading(false);
      } else if (botId && redirectUrl) {
        // Create new session
        const { data: sessionData, error: sessionErr } = await supabase.functions.invoke(
          "web-login-widget/auth",
          {
            method: "POST",
            body: { bot_id: botId, redirect_url: redirectUrl, state },
          }
        );
        if (sessionErr || !sessionData?.session_id) {
          setError("Не удалось создать сессию авторизации");
          setLoading(false);
          return;
        }
        setSessionInfo({
          session_id: sessionData.session_id,
          bot_id: botId,
          site_name: extractSiteName(redirectUrl),
          redirect_url: redirectUrl,
          state,
          requested_scopes: ["name", "username", "photo"],
        });
        setLoading(false);
      } else {
        setError("Недостаточно параметров");
        setLoading(false);
      }
    };

    init();
  }, [sessionId, botId, redirectUrl, state]);

  const handleAllow = async () => {
    if (!user || !sessionInfo) return;
    setProcessing(true);

    try {
      // Get JWT for edge function auth
      const { data: { session } } = await supabase.auth.getSession();
      const jwt = session?.access_token;

      // We need to authorize the session server-side
      // Since this page is inside our app, we POST to a custom endpoint
      const { data, error: invokeErr } = await supabase.functions.invoke(
        "web-login-widget/authorize-user",
        {
          method: "POST",
          body: {
            session_id: sessionInfo.session_id,
            user_id: user.id,
          },
          headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
        }
      );

      if (invokeErr || data?.error) {
        setError("Ошибка авторизации");
        return;
      }

      sendToParent(data.auth_data);
      setDone(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setProcessing(false);
    }
  };

  const handleDeny = () => {
    sendToParent(null);
    setDone(true);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <AppPageShell centered aurora>
        <SpinnerIcon active size={32} tone="alt" className="mx-auto text-indigo-400" />
      </AppPageShell>
    );
  }

  if (done) {
    return (
      <AppPageShell centered aurora className="px-4">
        <div className="mx-auto w-full max-w-[360px]">
          <AppGlassCard className="text-center">
            <VerifiedIcon active size={48} tone="green" className="mx-auto text-emerald-400" />
            <p className="glass-title mt-3 text-base font-semibold">Авторизация завершена</p>
            <p className="glass-muted text-sm mt-1">Окно закроется автоматически…</p>
          </AppGlassCard>
        </div>
      </AppPageShell>
    );
  }

  if (error) {
    return (
      <AppPageShell centered aurora className="px-4">
        <div className="mx-auto w-full max-w-[360px]">
          <AppGlassCard className="text-center">
            <p className="text-rose-300 font-medium">{error}</p>
            <AppSecondaryButton
              className="mt-4"
              onClick={() => window.close()}
            >
              Закрыть
            </AppSecondaryButton>
          </AppGlassCard>
        </div>
      </AppPageShell>
    );
  }

  if (!user) {
    return (
      <AppPageShell centered aurora className="px-4">
        <div className="mx-auto w-full max-w-[360px]">
          <AppGlassCard className="text-center">
            <p className="glass-title text-base font-semibold">Требуется вход</p>
            <p className="glass-muted text-sm mt-1">
              Для продолжения необходимо войти в аккаунт
            </p>
            <AppPrimaryButton
              className="mt-4"
              onClick={() => {
                window.location.href = `/auth?next=${encodeURIComponent(window.location.href)}`;
              }}
            >
              Войти
            </AppPrimaryButton>
          </AppGlassCard>
        </div>
      </AppPageShell>
    );
  }

  const si = sessionInfo!;

  return (
    <AppPageShell centered aurora className="px-4 py-8">
      <div className="mx-auto w-full max-w-[420px]">
        <AppGlassCard className="p-0">
          {/* Header */}
          <div className="p-6 text-center space-y-3 border-b border-white/10">
            <div className="flex items-center justify-center gap-3">
              {si.site_icon ? (
                <img
                  loading="lazy"
                  src={si.site_icon}
                  alt={si.site_name}
                  className="w-10 h-10 rounded-xl ring-1 ring-white/15"
                />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-white/10 ring-1 ring-white/15 flex items-center justify-center">
                  <GlobeIcon size={20} noAnimate className="opacity-70" />
                </div>
              )}
              <span className="glass-muted text-lg">→</span>
              <Avatar className="w-10 h-10 ring-1 ring-white/15">
                <AvatarImage src={metaAvatarUrl || undefined} />
                <AvatarFallback className="bg-indigo-500/30 text-indigo-100 text-sm">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </div>

            <div>
              <h2 className="glass-title text-base font-semibold">
                {si.site_name} запрашивает доступ
              </h2>
              <p className="glass-muted text-xs mt-1">
                {new URL(si.redirect_url).origin}
              </p>
            </div>
          </div>

          {/* Requested permissions */}
          <div className="p-5 space-y-2">
            <p className="glass-muted text-xs font-semibold uppercase tracking-[0.18em] mb-3">
              Будет передано
            </p>

            {si.requested_scopes.map((scope) => {
              const s = SCOPE_LABELS[scope];
              if (!s) return null;
              const Icon = s.icon;
              return (
                <div key={scope} className="flex items-center gap-3 text-sm">
                  <div className="w-7 h-7 rounded-lg bg-white/10 ring-1 ring-white/10 flex items-center justify-center flex-shrink-0">
                    <Icon size={14} noAnimate className="opacity-75" />
                  </div>
                  <span className="glass-title text-[13px]">{s.label}</span>
                  <Badge
                    variant="outline"
                    className="ml-auto border-white/15 bg-white/5 text-[10px] uppercase tracking-wider opacity-75"
                  >
                    только чтение
                  </Badge>
                </div>
              );
            })}

            <p className="glass-muted text-xs pt-2">
              Пароль и личные сообщения <strong className="opacity-90">никогда</strong> не передаются.
            </p>
          </div>

          {/* User info */}
          <div className="mx-5 mb-4 p-3 rounded-xl bg-white/5 ring-1 ring-white/10 flex items-center gap-3">
            <Avatar className="w-8 h-8">
              <AvatarImage src={metaAvatarUrl || undefined} />
              <AvatarFallback className="bg-white/10 text-xs">
                {initials || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="glass-title text-sm font-medium truncate">{fallbackName}</p>
              {metaUsername && <p className="glass-muted text-xs">@{metaUsername}</p>}
            </div>
          </div>

          {/* Actions */}
          <div className="p-5 pt-0 space-y-2">
            <AppPrimaryButton onClick={handleAllow} disabled={processing}>
              {processing && <SpinnerIcon active size={16} className="mr-2" />}
              Разрешить
            </AppPrimaryButton>
            <AppSecondaryButton onClick={handleDeny} disabled={processing}>
              Отклонить
            </AppSecondaryButton>
          </div>
        </AppGlassCard>
      </div>
    </AppPageShell>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extractSiteName(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch (_err) {
    return url;
  }
}

export default WebLoginCallbackPage;
