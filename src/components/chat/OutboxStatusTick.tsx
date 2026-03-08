/**
 * OutboxStatusTick — Telegram-style message delivery status indicator.
 *
 * States:
 *   pending/sending → single grey clock icon (outbox optimistic)
 *   sent            → single grey tick (✓)
 *   delivered       → double grey tick (✓✓)
 *   read            → double blue tick (✓✓) — Telegram's "seen"
 *   failed          → red exclamation mark
 *
 * Интеграция с реальным delivery_status:
 *   Если передан `serverStatus` (из useDeliveryStatus.statusMap) И сообщение уже
 *   сохранено на сервере (нет id.startsWith("local:")), то делегируем рендер в
 *   <DeliveryTick> с серверным статусом.
 *   Пока сообщение в outbox (local:*) — показываем локальную индикацию ниже.
 *
 * Accessibility: aria-label описывает состояние для screen reader на русском языке.
 *
 * Performance: pure SVG, no external dependencies, renders in <0.1ms.
 */

import React from "react";
import { cn } from "@/lib/utils";
import { DeliveryTick } from "./DeliveryTick";
import type { ServerDeliveryStatus } from "@/hooks/useDeliveryStatus";

export type DeliveryStatus = "pending" | "sending" | "sent" | "delivered" | "read" | "failed";

interface OutboxStatusTickProps {
  status: DeliveryStatus;
  className?: string;
  /**
   * Реальный delivery_status из БД (из useDeliveryStatus.statusMap).
   * Передавать только если у сообщения уже есть серверный id (не local:*).
   * Когда задан — OutboxStatusTick делегирует рендер в DeliveryTick.
   */
  serverStatus?: ServerDeliveryStatus;
}

export function OutboxStatusTick({ status, className, serverStatus }: OutboxStatusTickProps) {
  // Если есть серверный статус — показываем реальный тик из БД
  if (serverStatus) {
    return <DeliveryTick status={serverStatus} className={className} />;
  }

  const base = cn("inline-flex items-center shrink-0", className);

  if (status === "pending" || status === "sending") {
    return (
      <span className={base} aria-label="Отправляется">
        {/* Clock icon */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="text-muted-foreground/60"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7 4v3l2 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span className={base} aria-label="Ошибка отправки">
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="text-destructive"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7 4v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="7" cy="10" r="0.75" fill="currentColor" />
        </svg>
      </span>
    );
  }

  if (status === "sent") {
    return (
      <span className={base} aria-label="Отправлено">
        <SingleTick className="text-muted-foreground/70" />
      </span>
    );
  }

  if (status === "delivered") {
    return (
      <span className={base} aria-label="Доставлено">
        <DoubleTick blue={false} />
      </span>
    );
  }

  // read
  return (
    <span className={base} aria-label="Прочитано">
      <DoubleTick blue={true} />
    </span>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SingleTick({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className={cn("inline-block", className)}
      aria-hidden="true"
    >
      <path
        d="M2.5 7L5.5 10L11.5 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DoubleTick({ blue }: { blue: boolean }) {
  const color = blue ? "#4FC3F7" /* Telegram blue */ : "currentColor";
  const colorClass = blue ? "" : "text-muted-foreground/70";
  return (
    <svg
      width="18"
      height="14"
      viewBox="0 0 18 14"
      fill="none"
      className={cn("inline-block", colorClass)}
      aria-hidden="true"
    >
      {/* First tick (offset left) */}
      <path
        d="M0.5 7L3.5 10L9.5 4"
        stroke={blue ? color : "currentColor"}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Second tick (offset right) */}
      <path
        d="M5 7L8 10L14 4"
        stroke={blue ? color : "currentColor"}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
