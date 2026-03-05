/**
 * PlatformLayout — адаптивная корневая обёртка приложения.
 *
 * Раскладка по типу устройства:
 *
 *   phone (iOS / Android)
 *     → Full-screen single-column layout с нижней навигацией.
 *       Safe-area insets применяются через CSS env().
 *
 *   tablet (iPadOS / Android tablet)
 *     → Split-view: sidebar (280 px) + content area.
 *       В landscape — постоянный sidebar.
 *       В portrait — drawer sidebar (скрывается).
 *
 *   desktop (Windows / macOS / Linux)
 *     → Трёхколоночный layout: nav rail (72 px) + sidebar (320 px) + content.
 *       Max-width контейнер 1440 px центрирован.
 *
 * CSS-атрибуты на <html> (устанавливаются applyPlatformAttributes):
 *   [data-form-factor="phone"]   → mobile layout
 *   [data-form-factor="tablet"]  → tablet split layout
 *   [data-form-factor="desktop"] → desktop three-column layout
 *   [data-os="ios"]              → iOS safe-area / home indicator padding
 *   [data-os="android"]          → Android navigation bar padding
 *   [data-orientation="landscape"] → landscape-specific overrides
 */

import React, { useEffect } from "react";
import { usePlatform } from "@/hooks/usePlatform";

interface PlatformLayoutProps {
  children: React.ReactNode;
  /** Optional sidebar content — shown in tablet/desktop split view. */
  sidebar?: React.ReactNode;
  /** Optional nav rail content — shown in desktop three-column layout. */
  navRail?: React.ReactNode;
}

export const PlatformLayout: React.FC<PlatformLayoutProps> = ({
  children,
  sidebar,
  navRail,
}) => {
  const platform = usePlatform();

  // Update CSS custom properties derived from platform info.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--screen-w", `${platform.screenWidth}px`);
    root.style.setProperty("--screen-h", `${platform.screenHeight}px`);
    root.style.setProperty(
      "--sidebar-width",
      platform.formFactor === "desktop" ? "320px" : platform.formFactor === "tablet" ? "280px" : "0px",
    );
    root.style.setProperty(
      "--nav-rail-width",
      platform.formFactor === "desktop" ? "72px" : "0px",
    );
  }, [platform.formFactor, platform.screenWidth, platform.screenHeight]);

  return (
    <div
      className={[
        "platform-root",
        `platform-root--${platform.formFactor}`,
        `platform-root--${platform.os}`,
        platform.isLandscape ? "platform-root--landscape" : "platform-root--portrait",
      ].join(" ")}
      aria-label="Application layout"
    >
      {/* Nav rail — desktop only */}
      {platform.formFactor === "desktop" && navRail && (
        <aside className="platform-nav-rail" aria-label="Navigation rail">
          {navRail}
        </aside>
      )}

      {/* Sidebar — tablet (landscape) and desktop */}
      {(platform.formFactor === "desktop" ||
        (platform.formFactor === "tablet" && platform.isLandscape)) &&
        sidebar && (
          <aside className="platform-sidebar" aria-label="Sidebar">
            {sidebar}
          </aside>
        )}

      {/* Main content */}
      <main className="platform-content" role="main">
        {children}
      </main>
    </div>
  );
};

export default PlatformLayout;
