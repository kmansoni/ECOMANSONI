/**
 * Mansoni Mini App — Dialogs & Navigation UI
 *
 * Собственные реализации popup, alert, confirm, навигационные кнопки.
 * Работают через DOM — без зависимости от Telegram.
 *
 * Не более 250 строк.
 */

import type { PopupParams, PopupButton, PopupResult } from './types';

// ── Overlay manager (singleton) ─────────────────────────

let _overlay: HTMLDivElement | null = null;

function ensureOverlay(): HTMLDivElement {
  if (_overlay) return _overlay;
  _overlay = document.createElement('div');
  _overlay.id = 'mini-app-overlay';
  _overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 99999;
    background: rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.2s;
    pointer-events: none;
  `;
  document.body.appendChild(_overlay);
  return _overlay;
}

function showOverlay(): void {
  const el = ensureOverlay();
  el.style.pointerEvents = 'auto';
  requestAnimationFrame(() => { el.style.opacity = '1'; });
}

function hideOverlay(): void {
  if (!_overlay) return;
  _overlay.style.opacity = '0';
  setTimeout(() => { _overlay!.style.pointerEvents = 'none'; }, 200);
}

// ── Popup ───────────────────────────────────────────────

export function showPopup(params: PopupParams): Promise<PopupResult> {
  return new Promise((resolve) => {
    const overlay = ensureOverlay();
    const popup = document.createElement('div');
    popup.style.cssText = `
      background: #1e1e2e; border-radius: 16px; padding: 24px;
      max-width: 340px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      color: #fff; font-family: system-ui, sans-serif;
    `;

    if (params.title) {
      const title = document.createElement('h3');
      title.textContent = params.title;
      title.style.cssText = 'margin: 0 0 8px; font-size: 18px; font-weight: 600;';
      popup.appendChild(title);
    }

    const msg = document.createElement('p');
    msg.textContent = params.message;
    msg.style.cssText = 'margin: 0 0 20px; font-size: 14px; color: #a0a0b0; line-height: 1.5;';
    popup.appendChild(msg);

    const buttons = params.buttons || [{ type: 'ok', text: 'OK' }];
    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;';

    buttons.forEach((btn) => {
      const el = document.createElement('button');
      el.textContent = btn.text;
      el.style.cssText = `
        padding: 10px 20px; border: none; border-radius: 10px;
        font-size: 14px; font-weight: 600; cursor: pointer;
        transition: transform 0.1s, background 0.2s;
      `;

      const colors: Record<string, [string, string]> = {
        ok: ['#6c63ff', '#fff'],
        cancel: ['transparent', '#a0a0b0'],
        close: ['transparent', '#a0a0b0'],
        destructive: ['#e94560', '#fff'],
        default: ['#3a3a5c', '#fff'],
      };
      const [bg, fg] = colors[btn.type] || colors.default;
      el.style.background = bg;
      el.style.color = fg;

      el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.05)'; });
      el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });

      el.addEventListener('click', () => {
        cleanup();
        resolve({ buttonId: btn.id });
      });

      btnContainer.appendChild(el);
    });

    popup.appendChild(btnContainer);
    overlay.appendChild(popup);
    showOverlay();

    function cleanup() {
      if (popup.parentNode) popup.remove();
      hideOverlay();
    }
  });
}

// ── Alert ───────────────────────────────────────────────

export function showAlert(message: string): Promise<{ ok: boolean }> {
  return showPopup({ title: 'Внимание', message, buttons: [{ type: 'ok', text: 'OK' }] })
    .then(() => ({ ok: true }));
}

// ── Confirm ─────────────────────────────────────────────

export function showConfirm(message: string): Promise<{ ok: boolean }> {
  return showPopup({
    title: 'Подтверждение',
    message,
    buttons: [
      { type: 'cancel', text: 'Отмена' },
      { type: 'ok', text: 'ОК' },
    ],
  }).then((r) => ({ ok: r.buttonId !== 'cancel', result: r.buttonId !== 'cancel' }));
}

// ── Bottom Navigation Bar ───────────────────────────────

export function createBottomBar(buttons: Array<{ id: string; icon: string; label?: string; handler: () => void }>): void {
  const existing = document.getElementById('mini-app-bottom-bar');
  if (existing) existing.remove();

  const bar = document.createElement('div');
  bar.id = 'mini-app-bottom-bar';
  bar.style.cssText = `
    position: fixed; bottom: 0; left: 0; right: 0;
    display: flex; justify-content: space-around; align-items: center;
    background: #12121f; border-top: 1px solid #2a2a3e;
    padding: 8px 0; z-index: 99998;
    backdrop-filter: blur(12px);
  `;

  buttons.forEach((btn) => {
    const el = document.createElement('button');
    el.style.cssText = `
      display: flex; flex-direction: column; align-items: center;
      background: none; border: none; cursor: pointer;
      color: #8b8fa3; font-size: 10px; gap: 2px; padding: 4px 8px;
      border-radius: 8px; transition: color 0.2s;
    `;

    const icon = document.createElement('span');
    icon.textContent = btn.icon;
    icon.style.fontSize = '20px';

    const label = document.createElement('span');
    label.textContent = btn.label || '';

    el.appendChild(icon);
    el.appendChild(label);

    el.addEventListener('click', btn.handler);
    bar.appendChild(el);
  });

  document.body.appendChild(bar);
}

// ── Top Title Bar ───────────────────────────────────────

export function setTitleBar(title: string, subtitle?: string): void {
  let bar = document.getElementById('mini-app-title-bar') as HTMLElement;
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'mini-app-title-bar';
    bar.style.cssText = `
      position: sticky; top: 0; z-index: 100;
      background: var(--color-surface, #1e1e2e);
      padding: 12px 16px; border-bottom: 1px solid #2a2a3e;
    `;
    document.body.prepend(bar);
  }
  bar.innerHTML = `
    <div style="font-size:17px;font-weight:600;color:#fff">${title}</div>
    ${subtitle ? `<div style="font-size:12px;color:#8b8fa3">${subtitle}</div>` : ''}
  `;
}

// ── Badge / Tab indicator ───────────────────────────────

export function setBadge(id: string, count: number): void {
  const el = document.getElementById(`tab-${id}`);
  let badge = el?.querySelector('.badge') as HTMLElement;
  if (!el) return;
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'badge';
    badge.style.cssText = `
      position: absolute; top: 2px; right: 2px;
      background: #e94560; color: #fff;
      font-size: 10px; font-weight: 700;
      min-width: 16px; height: 16px;
      border-radius: 8px; display: flex;
      align-items: center; justify-content: center;
      padding: 0 4px;
    `;
    el.style.position = 'relative';
    el.appendChild(badge);
  }
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.style.display = count > 0 ? 'flex' : 'none';
}