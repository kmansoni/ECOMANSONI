/**
 * DeliveryTick — SVG-компонент статуса доставки для сообщений из базы данных.
 *
 * Визуал (как в WhatsApp/Telegram):
 *   sending  → ⏳ часики (серый)
 *   sent     → ✓  одна галочка (серая)
 *   delivered → ✓✓ две галочки (серые)
 *   read     → ✓✓ две галочки (синие)
 *   failed   → ⚠  предупреждение (красный)
 *
 * Доступность: aria-label с описанием на русском для скринридеров.
 * Анимация: CSS transition на opacity при смене состояния.
 * Размер: 16×16px (double tick: 20×16px).
 */

import React from "react";
import { cn } from "@/lib/utils";
import type { ServerDeliveryStatus } from "@/hooks/useDeliveryStatus";

interface DeliveryTickProps {
  status: ServerDeliveryStatus;
  className?: string;
}

export function DeliveryTick({ status, className }: DeliveryTickProps) {
  const base = cn(
    "inline-flex items-center shrink-0 transition-opacity duration-200",
    className
  );

  if (status === "sending") {
    return (
      <span className={base} aria-label="Отправляется">
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
          className="text-muted-foreground/60"
        >
          <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M7 4v3l2 1.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
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
          aria-hidden="true"
          className="text-destructive"
        >
          {/* Треугольник предупреждения */}
          <path
            d="M7 1.5L13 12.5H1L7 1.5Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path
            d="M7 5.5v3.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <circle cx="7" cy="10.5" r="0.65" fill="currentColor" />
        </svg>
      </span>
    );
  }

  if (status === "sent") {
    return (
      <span className={base} aria-label="Отправлено">
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
          className="text-muted-foreground/70"
        >
          <path
            d="M2.5 7L5.5 10L11.5 4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
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

function DoubleTick({ blue }: { blue: boolean }) {
  const strokeColor = blue ? "#4FC3F7" : "currentColor";
  const colorClass = blue ? "" : "text-muted-foreground/70";
  return (
    <svg
      width="20"
      height="14"
      viewBox="0 0 20 14"
      fill="none"
      aria-hidden="true"
      className={cn("inline-block transition-colors duration-300", colorClass)}
    >
      {/* Первая галочка (смещена влево) */}
      <path
        d="M1 7L4 10L10 4"
        stroke={strokeColor}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Вторая галочка (смещена вправо) */}
      <path
        d="M6 7L9 10L15 4"
        stroke={strokeColor}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
