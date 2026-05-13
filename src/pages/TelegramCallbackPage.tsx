/**
 * TelegramCallbackPage — обрабатывает callback от Telegram OAuth
 *
 * Flow:
 * 1. Telegram перенаправляет сюда с параметрами (id, first_name, username, hash, auth_date)
 * 2. Вызываем edge function для верификации подписи
 * 3. При успехе получаем Supabase JWT и сохраняем сессию
 * 4. Перенаправляем на главную страницу
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { Loader2 } from "lucide-react";

export function TelegramCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Получаем параметры от Telegram
        const id = searchParams.get("id");
        const firstName = searchParams.get("first_name");
        const lastName = searchParams.get("last_name");
        const username = searchParams.get("username");
        const photoUrl = searchParams.get("photo_url");
        const authDate = searchParams.get("auth_date");
        const hash = searchParams.get("hash");

        if (!id || !hash || !authDate) {
          throw new Error("Неверные параметры Telegram OAuth");
        }

// Вызываем edge function для верификации и создания сессии
         const { data, error } = await supabase.functions.invoke("telegram-auth", {
           method: "POST",
           body: {
             telegram_id: id,
             first_name: firstName,
             last_name: lastName,
             username: username,
             photo_url: photoUrl,
             auth_date: authDate,
             hash: hash,
             is_premium: searchParams.get("is_premium") === "true",
             language_code: searchParams.get("language_code") || undefined,
             start_param: searchParams.get("start_param") || undefined,
           },
         });

        if (error) {
          throw error;
        }

        if (!data?.session) {
          throw new Error("Не удалось создать сессию");
        }

        // Сохраняем сессию
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

        if (sessionError) {
          throw sessionError;
        }

        toast.success(`Добро пожаловать, ${firstName || username || "пользователь"}!`);
        navigate("/");
      } catch (error) {
        logger.error("[TelegramCallback] Auth error", { error });
        toast.error("Ошибка авторизации через Telegram", {
          description: String((error as Error)?.message || "Попробуйте ещё раз"),
        });
        navigate("/auth");
      } finally {
        setLoading(false);
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          <p className="text-sm text-gray-400">Авторизация через Telegram...</p>
        </div>
      </div>
    );
  }

  return null;
}

export default TelegramCallbackPage;