// quick page state introspection
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => /mansoni\.ru/i.test(p.url())) ?? ctx.pages()[0];

const res = await page.evaluate(() => {
  const out = { url: location.href, pcs: [], errors: [] };
  // Enumerate all video / audio elements
  out.videos = [...document.querySelectorAll('video')].map((v, i) => ({
    idx: i,
    id: v.id,
    src: !!v.srcObject,
    streamId: v.srcObject?.id || null,
    tracks: v.srcObject?.getTracks().map(t => ({ kind: t.kind, id: t.id, muted: t.muted, enabled: t.enabled, rs: t.readyState, label: t.label })) || [],
    paused: v.paused, w: v.videoWidth, h: v.videoHeight, currentTime: v.currentTime,
  }));
  out.audios = [...document.querySelectorAll('audio')].map((v, i) => ({
    idx: i, src: !!v.srcObject,
    tracks: v.srcObject?.getTracks().map(t => ({ kind: t.kind, muted: t.muted, enabled: t.enabled, rs: t.readyState, label: t.label })) || [],
    paused: v.paused, vol: v.volume,
  }));
  // Look for global call state hooks
  const w = window;
  if (w.__mansoniCallDebug) out.debug = w.__mansoniCallDebug;
  // React DevTools poke
  try {
    const root = document.querySelector('#root');
    out.bodyText = document.body.innerText.slice(0, 500);
  } catch {}
  return out;
});
console.log(JSON.stringify(res, null, 2));
process.exit(0);
