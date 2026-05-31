// Callee-аудит: повесить текущий звонок, дождаться входящего, принять и снять полный лог.
// Особое внимание: E2EE_*, KEY_PACKAGE, REKEY_*, CONSUMER_ADDED video, recv-PC track video,
// downlink stats отдельно по аудио/видео.
//
// Запуск: node scripts/debug/audit-callee.mjs
// Лог:    scripts/debug/mansoni-callee-audit.log

import { chromium } from 'playwright';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG = resolve(__dirname, 'mansoni-callee-audit.log');
mkdirSync(dirname(LOG), { recursive: true });
writeFileSync(LOG, '');

const T0 = Date.now();
function elapsed() { return ((Date.now() - T0) / 1000).toFixed(3) + 's'; }
function ts() { return new Date().toISOString(); }
function write(line) {
  const out = `[${ts()} +${elapsed()}] ${line}\n`;
  process.stdout.write(out);
  try { appendFileSync(LOG, out); } catch {}
}

write('--- callee audit start ---');

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
if (!ctx) { write('no context'); process.exit(1); }
const page = ctx.pages().find((p) => /mansoni\.ru/i.test(p.url())) ?? ctx.pages()[0];
write(`page: ${page.url()}`);

// --- мост страница→node ---
await page.exposeBinding('__auditLog', (_src, msg) => write(`PAGE :: ${msg}`));

// --- инжект инструментации ---
const INSTRUMENT = `(() => {
  if (window.__mansoniAuditCallee) return;
  window.__mansoniAuditCallee = true;
  const log = (m) => { try { window.__auditLog(String(m)); } catch {} };
  const md = navigator.mediaDevices;
  if (md && md.getUserMedia) {
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = async (c) => {
      log('[gUM] request ' + JSON.stringify(c));
      try { const s = await orig(c); log('[gUM] ok tracks=' + s.getTracks().map(t => t.kind + ':' + t.label).join(',')); return s; }
      catch (e) { log('[gUM] error ' + e.name + ' ' + e.message); throw e; }
    };
  }
  const O = window.RTCPeerConnection;
  if (!O || O.__wrapped) return;
  const Wrapped = function (...args) {
    const pc = new O(...args);
    const id = 'pc#' + Math.random().toString(36).slice(2, 7);
    log('[' + id + '] created cfg=' + JSON.stringify(args[0] ?? {}).slice(0, 400));
    pc.addEventListener('iceconnectionstatechange', () => log('[' + id + '] iceState=' + pc.iceConnectionState));
    pc.addEventListener('connectionstatechange', () => log('[' + id + '] connState=' + pc.connectionState));
    pc.addEventListener('signalingstatechange', () => log('[' + id + '] sigState=' + pc.signalingState));
    pc.addEventListener('icegatheringstatechange', () => log('[' + id + '] iceGather=' + pc.iceGatheringState));
    pc.addEventListener('icecandidateerror', (e) => log('[' + id + '] candidateError code=' + e.errorCode + ' ' + e.errorText + ' url=' + e.url));
    pc.addEventListener('track', (e) => {
      const t = e.track;
      log('[' + id + '] track kind=' + t.kind + ' id=' + t.id + ' label=' + t.label + ' streams=' + e.streams.length + ' enabled=' + t.enabled + ' muted=' + t.muted + ' readyState=' + t.readyState);
      t.addEventListener('mute', () => log('[' + id + '/' + t.kind + '] track.mute'));
      t.addEventListener('unmute', () => log('[' + id + '/' + t.kind + '] track.unmute'));
      t.addEventListener('ended', () => log('[' + id + '/' + t.kind + '] track.ended'));
    });
    const wrap = (n) => { const fn = pc[n].bind(pc); pc[n] = async (...a) => { log('[' + id + '] ' + n + ' call'); try { const r = await fn(...a); log('[' + id + '] ' + n + ' ok'); return r; } catch (e) { log('[' + id + '] ' + n + ' ERR ' + e.message); throw e; } }; };
    ['createOffer','createAnswer','setLocalDescription','setRemoteDescription','addIceCandidate'].forEach(wrap);

    let prev = { up: 0, dn: 0, lost: 0, dnA: 0, dnV: 0 };
    setInterval(async () => {
      if (pc.connectionState === 'closed' || pc.connectionState === 'failed') return;
      try {
        const s = await pc.getStats();
        let up = 0, dn = 0, lost = 0, rtt = 0, dnA = 0, dnV = 0, dnVFrames = 0, dnVDecoded = 0, dnVKey = 0;
        s.forEach((r) => {
          if (r.type === 'outbound-rtp') up += r.bytesSent || 0;
          if (r.type === 'inbound-rtp') {
            dn += r.bytesReceived || 0; lost += r.packetsLost || 0;
            if (r.kind === 'audio') dnA += r.bytesReceived || 0;
            if (r.kind === 'video') { dnV += r.bytesReceived || 0; dnVFrames = r.framesReceived ?? dnVFrames; dnVDecoded = r.framesDecoded ?? dnVDecoded; dnVKey = r.keyFramesDecoded ?? dnVKey; }
          }
          if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated) rtt = r.currentRoundTripTime || rtt;
        });
        const dUp = up - prev.up, dDn = dn - prev.dn, dL = lost - prev.lost, dDnA = dnA - prev.dnA, dDnV = dnV - prev.dnV;
        prev = { up, dn, lost, dnA, dnV };
        log('[' + id + '/' + pc.connectionState + '] Δup=' + dUp + 'B Δdn(a=' + dDnA + ',v=' + dDnV + ')B Δlost=' + dL + ' rtt=' + rtt + 's vFrames=' + dnVFrames + ' vDecoded=' + dnVDecoded + ' vKey=' + dnVKey);
      } catch (e) { log('[' + id + '] stats err ' + e.message); }
    }, 2000);
    return pc;
  };
  Wrapped.prototype = O.prototype;
  Wrapped.__wrapped = true;
  window.RTCPeerConnection = Wrapped;
  log('[audit] wrapped RTCPeerConnection');
})();`;

await page.addInitScript(INSTRUMENT);
await page.evaluate(INSTRUMENT);
write('instrumentation injected');

// --- WS / network ---
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning' || /sframe|e2ee|rekey|key_package|key|decrypt|encrypt|consumer|producer|track|video|webrtc|ice|call\.|error/i.test(m.text())) {
    write(`CONSOLE[${t}] ${m.text()}`);
  }
});
page.on('pageerror', (e) => write(`PAGEERROR ${e.message}`));
page.on('requestfailed', (r) => write(`REQFAIL ${r.method()} ${r.url()} :: ${r.failure()?.errorText}`));
page.on('response', (r) => {
  const u = r.url();
  if (r.status() >= 400 || /sfu|livekit|signal|realtime|call|webrtc|video_calls/i.test(u)) {
    write(`RESP ${r.status()} ${r.request().method()} ${u}`);
  }
});
const KEY = /KEY_PACKAGE|REKEY|E2EE|CONSUMER_|PRODUCER_|PEER_|call\.|participant-stream|ROOM_/i;
page.on('websocket', (ws) => {
  const u = ws.url();
  write(`WS open ${u}`);
  ws.on('framesent', (f) => {
    const p = typeof f.payload === 'string' ? f.payload : `<bin>`;
    if (KEY.test(p)) write(`WS→ ${String(p).slice(0, 600)}`);
  });
  ws.on('framereceived', (f) => {
    const p = typeof f.payload === 'string' ? f.payload : `<bin>`;
    if (KEY.test(p)) write(`WS← ${String(p).slice(0, 600)}`);
  });
  ws.on('socketerror', (e) => write(`WS!! ${u} :: ${e}`));
  ws.on('close', () => write(`WS close ${u}`));
});

// --- 1. Если активен звонок — повесить ---
const endBtn = page.locator('[aria-label="Отбой"]').first();
if (await endBtn.isVisible().catch(() => false)) {
  write('>>> hanging up current call');
  await endBtn.click();
  await page.waitForTimeout(1500);
} else {
  write('no active call to hang up');
}

// --- 2. ждём входящий звонок и принимаем ---
write('waiting for incoming call (up to 240s)... please dial me now');
const ACCEPT_TIMEOUT = 240_000;
const startWait = Date.now();

async function tryAcceptIncoming() {
  const candidates = [
    page.locator('[aria-label="Ответить"]'),
    page.getByRole('button', { name: /^Ответить$/i }),
    page.getByText(/^Ответить$/i),
    page.getByRole('button', { name: /видеозвонок|аудиозвонок/i }),
  ];

  for (const loc of candidates) {
    const btn = loc.first();
    const visible = await btn.isVisible().catch(() => false);
    if (!visible) continue;
    await btn.click({ timeout: 2500 }).catch(() => {});
    const stillVisible = await btn.isVisible().catch(() => false);
    if (!stillVisible) return true;
  }
  return false;
}

let accepted = false;
while (!accepted && Date.now() - startWait < ACCEPT_TIMEOUT) {
  accepted = await tryAcceptIncoming();
  if (accepted) break;
  const incomingHintVisible = await page.getByText(/Входящий звонок/i).first().isVisible().catch(() => false);
  if (incomingHintVisible) {
    write('incoming sheet visible, retrying accept click...');
  }
  await page.waitForTimeout(1000);
}

if (!accepted) {
  write('incoming call did not appear or accept button was not clickable within timeout');
  process.exit(2);
}

write(`>>> ACCEPT clicked (latency to UI=${Date.now() - startWait}ms)`);

// держим живым
setInterval(() => {}, 1 << 30);
