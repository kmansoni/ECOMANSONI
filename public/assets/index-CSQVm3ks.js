// Compatibility shim for stale cached HTML shells that still reference
// /assets/index-CSQVm3ks.js after a newer deploy rotated hashed entry files.
const SELF_ENTRY_NAME = 'index-CSQVm3ks.js';
const RECOVERY_FLAG = '__compat_shim_recovered_index_csq__';

function makeFreshShellUrl() {
  const shellUrl = new URL('/index.html', window.location.origin);
  shellUrl.searchParams.set('__entry_probe', String(Date.now()));
  return shellUrl;
}

async function forceShellRecovery(reason) {
  try {
    if (sessionStorage.getItem(RECOVERY_FLAG) === '1') {
      throw new Error(`recovery_already_attempted:${reason}`);
    }
    sessionStorage.setItem(RECOVERY_FLAG, '1');

    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }

    const url = new URL(window.location.href);
    url.searchParams.set('__shell_refresh', String(Date.now()));
    window.location.replace(url.toString());
  } catch (error) {
    console.error('[compat-shim] shell recovery failed', { reason, error });
  }
}

(async function bootstrapFromLatestIndex() {
  try {
    const response = await fetch(makeFreshShellUrl().toString(), {
      cache: 'no-store',
      headers: {
        'cache-control': 'no-cache, no-store, max-age=0',
        pragma: 'no-cache',
      },
    });
    if (!response.ok) throw new Error('index_html_unavailable');

    const html = await response.text();
    const scriptMatch = html.match(/<script[^>]+type="module"[^>]+src="([^\"]*\/assets\/index-[^\"]+\.js)"/i);
    const cssMatch = html.match(/<link[^>]+rel="stylesheet"[^>]+href="([^\"]*\/assets\/index-[^\"]+\.css)"/i);

    // Attach latest CSS if present and different from this compatibility file.
    if (cssMatch && cssMatch[1] && !cssMatch[1].includes('index-Dervk6hL.css')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = cssMatch[1];
      document.head.appendChild(link);
    }

    if (!scriptMatch || !scriptMatch[1]) throw new Error('entry_script_not_found');
    const latestEntry = scriptMatch[1];
    if (latestEntry.includes(SELF_ENTRY_NAME)) {
      await forceShellRecovery('stale_index_recursion_guard');
      return;
    }

    await import(latestEntry);
  } catch (error) {
    await forceShellRecovery(error instanceof Error ? error.message : 'bootstrap_failed');
  }
})();
