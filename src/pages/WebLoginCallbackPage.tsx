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
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, Globe, User, AtSign, Image } from "lucide-react";

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

// ── Scope display ──────────────────────────────────────────────────────────

const SCOPE_LABELS: Record<string, { label: string; icon: typeof User }> = {
  name: { label: "Имя и фамилия", icon: User },
  username: { label: "Username (@имя)", icon: AtSign },
  photo: { label: "Фото профиля", icon: Image },
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
        } catch {
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
          { method: "GET" }
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
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center space-y-2">
          <ShieldCheck className="w-12 h-12 text-green-400 mx-auto" />
          <p className="text-gray-300">Авторизация завершена</p>
          <p className="text-gray-500 text-sm">Окно закроется автоматически…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center space-y-3 max-w-sm">
          <p className="text-red-400 font-medium">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="border-gray-700 text-gray-300"
            onClick={() => window.close()}
          >
            Закрыть
          </Button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <p className="text-gray-300">Для продолжения необходимо войти в аккаунт</p>
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => {
              window.location.href = `/auth?next=${encodeURIComponent(window.location.href)}`;
            }}
          >
            Войти
          </Button>
        </div>
      </div>
    );
  }

  const si = sessionInfo!;

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        {/* Header */}
        <div className="p-6 text-center border-b border-gray-800 space-y-3">
          <div className="flex items-center justify-center gap-3">
            {si.site_icon ? (
              <img
                src={si.site_icon}
                alt={si.site_name}
                className="w-10 h-10 rounded-xl"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center">
                <Globe className="w-5 h-5 text-gray-400" />
              </div>
            )}
            <span className="text-gray-400 text-lg">→</span>
            <Avatar className="w-10 h-10">
              <AvatarImage src={metaAvatarUrl || undefined} />
              <AvatarFallback className="bg-blue-900 text-blue-200 text-sm">
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>

          <div>
            <h2 className="text-gray-100 font-semibold text-base">
              {si.site_name} запрашивает доступ
            </h2>
            <p className="text-gray-500 text-xs mt-1">
              {new URL(si.redirect_url).origin}
            </p>
          </div>
        </div>

        {/* Requested permissions */}
        <div className="p-5 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Будет передано
          </p>

          {si.requested_scopes.map(scope => {
            const s = SCOPE_LABELS[scope];
            if (!s) return null;
            const Icon = s.icon;
            return (
              <div
                key={scope}
                className="flex items-center gap-3 text-sm text-gray-300"
              >
                <div className="w-7 h-7 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-3.5 h-3.5 text-gray-400" />
                </div>
                <span>{s.label}</span>
                <Badge
                  variant="outline"
                  className="ml-auto border-gray-700 text-gray-500 text-xs"
                >
                  только чтение
                </Badge>
              </div>
            );
          })}

          <p className="text-xs text-gray-600 pt-2">
            Пароль и личные сообщения <strong className="text-gray-500">никогда</strong> не передаются.
          </p>
        </div>

        {/* User info */}
        <div className="mx-5 mb-4 p-3 rounded-xl bg-gray-800/50 flex items-center gap-3">
          <Avatar className="w-8 h-8">
            <AvatarImage src={metaAvatarUrl || undefined} />
            <AvatarFallback className="bg-gray-700 text-gray-300 text-xs">
              {initials || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-200 font-medium truncate">
              {fallbackName}
            </p>
            {metaUsername && (
              <p className="text-xs text-gray-500">@{metaUsername}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="p-5 pt-0 space-y-2">
          <Button
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium"
            onClick={handleAllow}
            disabled={processing}
          >
            {processing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Разрешить
          </Button>
          <Button
            variant="ghost"
            className="w-full text-gray-400 hover:text-gray-200 hover:bg-gray-800"
            onClick={handleDeny}
            disabled={processing}
          >
            Отклонить
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extractSiteName(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default WebLoginCallbackPage;
