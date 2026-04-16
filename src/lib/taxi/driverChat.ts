/**
 * driverChat — чат между водителем и пассажиром во время поездки.
 *
 * Паттерн из крупных агрегаторов:
 *   - Uber: in-trip chat через маскированные номера / in-app чат
 *   - Яндекс Go: чат и звонок через proxy VoIP
 *   - Grab: в приложении, деактивируется после завершения поездки
 *
 * Архитектура:
 *   Использует существующую инфраструктуру чата проекта (conversations + messages).
 *   При назначении водителя автоматически создаётся временный conversation
 *   типа 'taxi_trip' с ride_id как external_id.
 *   Conversation удаляется (или скрывается) через 1 час после завершения поездки.
 *
 * Безопасность:
 *   - Реальные номера телефонов никогда не отображаются
 *   - VoIP proxy (Twilio/Vonage) маскирует звонки (будущее)
 *   - Conversation создаётся server-side через RPC
 *   - Пользователи не могут писать друг другу вне активной поездки
 *
 * Notification triggers:
 *   Водитель назначен → push пассажиру
 *   Водитель едет → push пассажиру
 *   Водитель прибыл → push пассажиру
 *   Поездка началась → push пассажиру
 *   Поездка завершена → push пассажиру и водителю
 */

import { dbLoose } from "@/lib/supabase";

const supabase = dbLoose;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TripChatMessage {
  id: string;
  senderId: string;
  senderRole: "passenger" | "driver";
  body: string;
  createdAt: string;
  isRead: boolean;
}

export interface TripChatHandle {
  conversationId: string;
  send: (body: string, senderRole: "passenger" | "driver") => Promise<void>;
  subscribe: (onMessage: (msg: TripChatMessage) => void) => () => void;
  markRead: (messageId: string) => Promise<void>;
}

// ── Create / get trip chat ────────────────────────────────────────────────────

/**
 * Создать или получить conversation для поездки.
 * Вызывается после назначения водителя.
 * Idempotent — if conversation exists for ride_id, returns existing.
 */
export async function getOrCreateTripChat(
  rideId: string,
  passengerId: string,
  driverUserId: string
): Promise<string> {
  const { data, error } = await supabase.rpc("taxi_get_or_create_trip_chat", {
    p_ride_id: rideId,
    p_passenger_id: passengerId,
    p_driver_user_id: driverUserId,
  });

  if (error) throw error;
  return String(data);
}

// ── Send message ──────────────────────────────────────────────────────────────

export async function sendTripMessage(
  conversationId: string,
  body: string
): Promise<void> {
  const trimmed = body.trim().slice(0, 300); // max 300 chars for trip chat
  if (!trimmed) return;

  const { error } = await supabase.rpc("send_message_v1", {
    conversation_id: conversationId,
    client_msg_id: `trip_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    body: trimmed,
  });

  if (error) throw error;
}

// ── Subscribe ─────────────────────────────────────────────────────────────────

export function subscribeTripChat(
  conversationId: string,
  onMessage: (msg: TripChatMessage) => void
): () => void {
  const channel = supabase
    .channel(`trip_chat_${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload: { new: Record<string, unknown> }) => {
        const row = payload.new;
        onMessage({
          id: String(row.id),
          senderId: String(row.sender_id),
          senderRole: (row.sender_role as "passenger" | "driver") ?? "passenger",
          body: String(row.body ?? ""),
          createdAt: String(row.created_at),
          isRead: false,
        });
      }
    )
    .subscribe();

  return () => { void supabase.removeChannel(channel); };
}

// ── Quick reply presets ───────────────────────────────────────────────────────
// Из Яндекс Go — быстрые ответы одним нажатием

export const QUICK_REPLIES_DRIVER: string[] = [
  "Еду к вам! 🚗",
  "Буду через 2 минуты",
  "Жду у входа",
  "Позвоните мне",
  "Уточните адрес подачи",
  "Уже подъехал",
];

export const QUICK_REPLIES_PASSENGER: string[] = [
  "Выхожу! 👋",
  "Буду через 1 минуту",
  "Подождите, пожалуйста",
  "Где вы стоите?",
  "Позвоните мне",
  "Иду к машине",
];

// ── Push notification triggers ────────────────────────────────────────────────

/**
 * Отправить push-уведомление о смене статуса заказа.
 * Использует Supabase Edge Function taxi-notifications.
 */
export async function sendTripStatusNotification(params: {
  recipientUserId: string;
  rideId: string;
  status: string;
  driverName?: string;
  driverEta?: number;
}): Promise<void> {
  try {
    await supabase.functions.invoke("taxi-notifications", {
      body: {
        user_id: params.recipientUserId,
        ride_id: params.rideId,
        status: params.status,
        driver_name: params.driverName,
        driver_eta: params.driverEta,
      },
    });
  } catch {
    // Non-critical — notification failure should not break trip flow
  }
}

// Notification message templates
export const TRIP_STATUS_MESSAGES: Record<string, (driverName?: string, eta?: number) => string> = {
  driver_found:   (n, e) => `Водитель ${n ?? ""} едет к вам. ETA: ${e ?? "?"} мин`,
  driver_arriving:(n)    => `Водитель ${n ?? ""} едет к вам`,
  driver_arrived: (n)    => `Водитель ${n ?? ""} прибыл. Найдите авто`,
  in_trip:        ()     => "Поездка началась. Удачной дороги!",
  completed:      ()     => "Поездка завершена. Оцените водителя!",
  cancelled:      ()     => "Заказ отменён",
};
