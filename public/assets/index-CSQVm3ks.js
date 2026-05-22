// Compatibility shim for stale cached HTML shells that still reference
// /assets/index-CSQVm3ks.js after a newer deploy rotated hashed entry files.
(async function bootstrapFromLatestIndex() {
  try {
    const response = await fetch('/index.html', { cache: 'no-store' });
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
    if (latestEntry.includes('index-CSQVm3ks.js')) {
      throw new Error('stale_index_recursion_guard');
    }

    await import(latestEntry);
  } catch (error) {
    console.error('[compat-shim] failed to bootstrap latest entry', error);
  }
})();
