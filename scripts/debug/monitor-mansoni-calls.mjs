// Подключается к уже запущенному Chrome по CDP (порт 9222) и слушает события,
// относящиеся к подсистеме звонков mansoni.ru: console, pageerror, requestfailed,
// сетевые ответы по SFU/LiveKit/Supabase Realtime/WebRTC/ICE, а также WebSocket-фреймы.
//
// Запуск: node scripts/debug/monitor-mansoni-calls.mjs
// Лог: scripts/debug/mansoni-calls-monitor.log

import { chromium } from 'playwright';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG = resolve(__dirname, 'mansoni-calls-monitor.log');
mkdirSync(dirname(LOG), { recursive: true });

const CALLS_HINT = /(call|sfu|livekit|webrtc|ice|turn|stun|realtime|signaling|signaling|rtc|peer|track|audio|video|media|opus|vp8|vp9|h264|sframe|rekey|e2ee)/i;

function ts() { return new Date().toISOString(); }
function write(line) {
  const out = `[${ts()}] ${line}\n`;
  process.stdout.write(out);
  try { appendFileSync(LOG, out); } catch {}
}

write('--- monitor start ---');

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const contexts = browser.contexts();
if (contexts.length === 0) {
  write('no contexts found, exiting');
  process.exit(1);
}

function attachPage(page) {
  const url = () => {
    try { return page.url(); } catch { return '<unknown>'; }
  };
  write(`attach page: ${url()}`);

  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error' || type === 'warning' || CALLS_HINT.test(text)) {
      write(`CONSOLE[${type}] ${url()} :: ${text}`);
    }
  });

  page.on('pageerror', (err) => {
    write(`PAGEERROR ${url()} :: ${err.message}\n${err.stack ?? ''}`);
  });

  page.on('requestfailed', (req) => {
    const u = req.url();
    if (CALLS_HINT.test(u) || /supabase|mansoni\.ru/i.test(u)) {
      write(`REQFAIL ${req.method()} ${u} :: ${req.failure()?.errorText}`);
    }
  });

  page.on('response', (res) => {
    const u = res.url();
    const status = res.status();
    if (status >= 400 && (CALLS_HINT.test(u) || /supabase|mansoni\.ru/i.test(u))) {
      write(`RESP ${status} ${res.request().method()} ${u}`);
    }
  });

  page.on('websocket', (ws) => {
    const wurl = ws.url();
    write(`WS open ${wurl}`);
    ws.on('framesent', (f) => {
      const p = typeof f.payload === 'string' ? f.payload : '<binary>';
      if (CALLS_HINT.test(wurl) || CALLS_HINT.test(p)) {
        write(`WS→ ${wurl} :: ${p.slice(0, 400)}`);
      }
    });
    ws.on('framereceived', (f) => {
      const p = typeof f.payload === 'string' ? f.payload : '<binary>';
      if (CALLS_HINT.test(wurl) || CALLS_HINT.test(p)) {
        write(`WS← ${wurl} :: ${p.slice(0, 400)}`);
      }
    });
    ws.on('socketerror', (e) => write(`WS!! ${wurl} :: ${e}`));
    ws.on('close', () => write(`WS close ${wurl}`));
  });
}

for (const ctx of contexts) {
  for (const p of ctx.pages()) attachPage(p);
  ctx.on('page', attachPage);
}

write(`monitoring ${contexts.length} context(s). log: ${LOG}`);

// держим процесс живым
setInterval(() => {}, 1 << 30);
