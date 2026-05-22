// Compatibility shim for stale cached shells that still load
// /assets/index-CG0j1Im8.js (buggy historical entry).
(async function bootstrapFromLatestIndex() {
  try {
    const response = await fetch('/index.html', { cache: 'no-store' });
    if (!response.ok) throw new Error('index_html_unavailable');

    const html = await response.text();
    const scriptMatch = html.match(/<script[^>]+type="module"[^>]+src="([^\"]*\/assets\/index-[^\"]+\.js)"/i);
    const cssMatch = html.match(/<link[^>]+rel="stylesheet"[^>]+href="([^\"]*\/assets\/index-[^\"]+\.css)"/i);

    if (cssMatch && cssMatch[1] && !cssMatch[1].includes('index-CG0j1Im8.js')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = cssMatch[1];
      document.head.appendChild(link);
    }

    if (!scriptMatch || !scriptMatch[1]) throw new Error('entry_script_not_found');
    const latestEntry = scriptMatch[1];
    if (latestEntry.includes('index-CG0j1Im8.js')) {
      throw new Error('stale_index_recursion_guard');
    }

    await import(latestEntry);
  } catch (error) {
    console.error('[compat-shim] failed to bootstrap latest entry', error);
  }
})();
