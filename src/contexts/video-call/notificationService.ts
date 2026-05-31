/**
 * Call Notification Service — single source of truth for all call-related notifications.
 *
 * Architecture:
 *  - This is the ONLY place where toast.* is called for call-related notifications
 *  - All hooks and Provider use this service via callbacks or direct calls
 *  - Easy to mock in tests
 */

import { toast } from "sonner";

export interface NotificationPayload {
  title: string;
  description?: string;
  duration?: number;
}

export interface CallNotificationService {
  error(payload: NotificationPayload): void;
  warning(payload: NotificationPayload): void;
  info(payload: NotificationPayload): void;
  success(payload: NotificationPayload): void;
}

class CallNotificationServiceImpl implements CallNotificationService {
  error({ title, description, duration = 5000 }: NotificationPayload): void {
    toast.error(title, { description, duration });
  }

  warning({ title, description, duration = 5000 }: NotificationPayload): void {
    toast.warning(title, { description, duration });
  }

  info({ title, description, duration = 3000 }: NotificationPayload): void {
    toast.info(title, { description, duration });
  }

  success({ title, description, duration = 3000 }: NotificationPayload): void {
    toast.success(title, { description, duration });
  }

  // Convenience methods for common call scenarios
  callNotAvailable(reason: string): void {
    this.error({
      title: "Звонок недоступен",
      description: reason,
      duration: 6000,
    });
  }

  callFailed(error: string): void {
    this.error({
      title: "Не удалось начать звонок",
      description: error,
      duration: 5000,
    });
  }

  callAnswerFailed(error: string): void {
    this.error({
      title: "Не удалось принять звонок",
      description: error,
      duration: 5000,
    });
  }

  networkError(): void {
    this.error({
      title: "Ошибка сети",
      description: "Проверьте подключение и попробуйте снова",
      duration: 5000,
    });
  }

  mediaPermissionDenied(kind: "audio" | "video"): void {
    this.error({
      title: "Доступ к медиа запрещён",
      description: `Разрешите доступ к ${kind === "audio" ? "микрофону" : "камере"} в настройках браузера`,
      duration: 8000,
    });
  }

  e2eeUnavailable(): void {
    this.warning({
      title: "Шифрование недоступно",
      description: "Ваш браузер не поддерживает E2EE. Обновите браузер.",
      duration: 8000,
    });
  }

  noAnswer(): void {
    this.info({
      title: "Нет ответа",
      duration: 3000,
    });
  }

  sfusBootstrapFailed(error: string): void {
    this.error({
      title: "Сервер звонков недоступен",
      description: error,
      duration: 5000,
    });
  }
}

// Singleton for app-wide use
export const callNotifications = new CallNotificationServiceImpl();
