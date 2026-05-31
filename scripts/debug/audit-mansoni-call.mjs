// Полный аудит звонка mansoni.ru:
// - Console / pageerror / requestfailed / responses
// - WebSocket-фреймы (signaling, SFU, Supabase Realtime)
// - Перехват RTCPeerConnection / getUserMedia / WebSocket с метками времени
// - Тайминги: click → gUM → offer → ICE → connected → первые медиапакеты
// - Периодический dump статистики RTCStats (bytes, packetsLost, rtt, jitter)
// - Автоматический клик по [data-testid="audio-call-btn"] (или video, если передан флаг)
//
// Запуск:
//   node scripts/debug/audit-mansoni-call.mjs            // audio
//   node scripts/debug/audit-mansoni-call.mjs --video    // video
//
// Лог: scripts/debug/mansoni-call-audit.log

import { chromium } from 'playwright';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG = resolve(__dirname, 'mansoni-call-audit.log');
mkdirSync(dirname(LOG), { recursive: true });
writeFileSync(LOG, '');

const VIDEO = process.argv.includes('--video');
const CALL_SELECTOR = VIDEO ? '[data-testid="video-call-btn"]' : '[data-testid="audio-call-btn"]';

const T0 = Date.now();
function elapsed() { return ((Date.now() - T0) / 1000).toFixed(3) + 's'; }
function ts() { return new Date().toISOString(); }
function write(line) {
  const out = `[${ts()} +${elapsed()}] ${line}\n`;
  process.stdout.write(out);
  try { appendFileSync(LOG, out); } catch {}
}

write(`--- call audit start (mode=${VIDEO ? 'video' : 'audio'}) ---`);
write(`selector: ${CALL_SELECTOR}`);

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
if (!ctx) { write('no context'); process.exit(1); }
const pages = ctx.pages();
const page = pages.find((p) => /mansoni\.ru/i.test(p.url())) ?? pages[0];
if (!page) { write('no page'); process.exit(1); }
write(`page: ${page.url()}`);

// --- слушатели Playwright ---
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning' || /call|sfu|livekit|webrtc|ice|turn|stun|realtime|signal|peer|track|media|opus|vp[89]|h264|sframe|rekey|e2ee|getuser|offer|answer|candidate/i.test(m.text())) {
    write(`CONSOLE[${t}] ${m.text()}`);
  }
});
page.on('pageerror', (e) => write(`PAGEERROR ${e.message}\n${e.stack ?? ''}`));
page.on('requestfailed', (r) => write(`REQFAIL ${r.method()} ${r.url()} :: ${r.failure()?.errorText}`));
page.on('response', (r) => {
  const u = r.url();
  if (r.status() >= 400) write(`RESP ${r.status()} ${r.request().method()} ${u}`);
  else if (/sfu|livekit|signal|realtime|call|turn|stun|webrtc/i.test(u)) write(`RESP ${r.status()} ${r.request().method()} ${u}`);
});
page.on('websocket', (ws) => {
  const u = ws.url();
  write(`WS open ${u}`);
  ws.on('framesent', (f) => {
    const p = typeof f.payload === 'string' ? f.payload : `<binary ${f.payload?.length ?? 0}b>`;
    write(`WS→ ${u} :: ${String(p).slice(0, 500)}`);
  });
  ws.on('framereceived', (f) => {
    const p = typeof f.payload === 'string' ? f.payload : `<binary ${f.payload?.length ?? 0}b>`;
    write(`WS← ${u} :: ${String(p).slice(0, 500)}`);
  });
  ws.on('socketerror', (e) => write(`WS!! ${u} :: ${e}`));
  ws.on('close', () => write(`WS close ${u}`));
});

// --- мост из page → node для событий из обёрток ---
await page.exposeBinding('__auditLog', (_src, msg) => write(`PAGE :: ${msg}`));

// --- инжект обёрток RTCPeerConnection / getUserMedia ---
const INSTRUMENT = `
(() => {
  if (window.__mansoniAudit) return;
  window.__mansoniAudit = true;
  const log = (m) => { try { window.__auditLog(String(m)); } catch {} };
  const t0 = performance.now();
  const dt = () => (performance.now() - t0).toFixed(1) + 'ms';

  // getUserMedia
  const md = navigator.mediaDevices;
  if (md && md.getUserMedia) {
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = async (c) => {
      log('[gUM] request ' + JSON.stringify(c));
      try {
        const s = await orig(c);
        log('[gUM] ok tracks=' + s.getTracks().map(t => t.kind + ':' + t.label).join(','));
        return s;
      } catch (e) { log('[gUM] error ' + e.name + ' ' + e.message); throw e; }
    };
  }

  // RTCPeerConnection
  const O = window.RTCPeerConnection;
  if (!O || O.__wrapped) return;
  const Wrapped = function (...args) {
    const pc = new O(...args);
    const id = 'pc#' + Math.random().toString(36).slice(2, 7);
    log('[' + id + '] created cfg=' + JSON.stringify(args[0] ?? {}).slice(0, 500));
    pc.addEventListener('iceconnectionstatechange', () => log('[' + id + '] iceState=' + pc.iceConnectionState));
    pc.addEventListener('connectionstatechange', () => log('[' + id + '] connState=' + pc.connectionState));
    pc.addEventListener('signalingstatechange', () => log('[' + id + '] sigState=' + pc.signalingState));
    pc.addEventListener('icegatheringstatechange', () => log('[' + id + '] iceGather=' + pc.iceGatheringState));
    pc.addEventListener('icecandidate', (e) => {
      if (e.candidate) log('[' + id + '] candidate ' + (e.candidate.type || '?') + ' ' + (e.candidate.protocol || '') + ' ' + (e.candidate.address || e.candidate.candidate.slice(0, 80)));
      else log('[' + id + '] candidate <end>');
    });
    pc.addEventListener('icecandidateerror', (e) => log('[' + id + '] candidateError code=' + e.errorCode + ' ' + e.errorText + ' url=' + e.url));
    pc.addEventListener('track', (e) => log('[' + id + '] track ' + e.track.kind + ' streams=' + e.streams.length));
    const wrapMethod = (name) => {
      const fn = pc[name].bind(pc);
      pc[name] = async (...a) => { log('[' + id + '] ' + name + ' call'); try { const r = await fn(...a); log('[' + id + '] ' + name + ' ok'); return r; } catch (e) { log('[' + id + '] ' + name + ' ERR ' + e.message); throw e; } };
    };
    ['createOffer','createAnswer','setLocalDescription','setRemoteDescription','addIceCandidate'].forEach(wrapMethod);

    // периодически снимаем stats
    let prev = { bytesSent: 0, bytesRecv: 0, packetsLost: 0 };
    setInterval(async () => {
      if (pc.connectionState === 'closed' || pc.connectionState === 'failed') return;
      try {
        const s = await pc.getStats();
        let bs = 0, br = 0, pl = 0, rtt = 0, jit = 0, kinds = new Set();
        s.forEach((r) => {
          if (r.type === 'outbound-rtp') { bs += r.bytesSent || 0; if (r.kind) kinds.add('↑' + r.kind); }
          if (r.type === 'inbound-rtp') { br += r.bytesReceived || 0; pl += r.packetsLost || 0; jit = Math.max(jit, r.jitter || 0); if (r.kind) kinds.add('↓' + r.kind); }
          if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated) rtt = r.currentRoundTripTime || rtt;
        });
        const dBs = bs - prev.bytesSent, dBr = br - prev.bytesRecv, dPl = pl - prev.packetsLost;
        prev = { bytesSent: bs, bytesRecv: br, packetsLost: pl };
        log('[' + id + '/' + pc.connectionState + '] ' + [...kinds].join(',') + ' Δup=' + dBs + 'B Δdn=' + dBr + 'B Δlost=' + dPl + ' rtt=' + rtt + 's jit=' + jit.toFixed(3));
      } catch (e) { log('[' + id + '] stats err ' + e.message); }
    }, 2000);

    return pc;
  };
  Wrapped.prototype = O.prototype;
  Wrapped.__wrapped = true;
  window.RTCPeerConnection = Wrapped;
  log('[audit] RTCPeerConnection wrapped');
})();
`;

await page.addInitScript(INSTRUMENT);
await page.evaluate(INSTRUMENT);
write('instrumentation injected');

// --- ищем кнопку звонка ---
const btn = page.locator(CALL_SELECTOR).first();
const visible = await btn.isVisible().catch(() => false);
if (!visible) {
  write(`call button ${CALL_SELECTOR} not visible — ждём 10s...`);
  try { await btn.waitFor({ state: 'visible', timeout: 10000 }); } catch (e) { write(`button not found: ${e.message}`); process.exit(2); }
}

write(`>>> CLICK ${CALL_SELECTOR}`);
await btn.click();
write('click dispatched, аудит идёт... (Ctrl+C для остановки)');

// держим живым
setInterval(() => {}, 1 << 30);
