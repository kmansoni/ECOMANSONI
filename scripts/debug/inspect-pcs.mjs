// inject a console capture and ask for PC list, then dump
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => /mansoni\.ru/i.test(p.url())) ?? ctx.pages()[0];

const res = await page.evaluate(async () => {
  // grab PCs via global registry from old wrapper
  const w = window;
  const out = { tracked: [] };
  // search for arrays of PCs created via wrapper, monkey patch leftover
  if (w.__mansoniPCs) out.tracked = w.__mansoniPCs.map((pc, i) => ({
    i, conn: pc.connectionState, ice: pc.iceConnectionState,
    senders: pc.getSenders().length,
    receivers: pc.getReceivers().map(r => ({ kind: r.track?.kind, id: r.track?.id, label: r.track?.label, rs: r.track?.readyState, muted: r.track?.muted })),
    transceivers: pc.getTransceivers().length,
  }));
  return out;
});
console.log(JSON.stringify(res, null, 2));

// Now register live PC observer for next 20s
await page.evaluate(() => {
  if (window.__pcDump) return;
  const arr = [];
  window.__pcDump = arr;
  const O = window.RTCPeerConnection;
  const W = function (...a) {
    const pc = new O(...a);
    arr.push(pc);
    return pc;
  };
  W.prototype = O.prototype;
  window.RTCPeerConnection = W;
});

await new Promise((r) => setTimeout(r, 1000));

const live = await page.evaluate(() => {
  return (window.__pcDump || []).map((pc, i) => ({
    i, conn: pc.connectionState, ice: pc.iceConnectionState,
    senders: pc.getSenders().map(s => ({ kind: s.track?.kind, id: s.track?.id })),
    receivers: pc.getReceivers().map(r => ({ kind: r.track?.kind, id: r.track?.id, label: r.track?.label, rs: r.track?.readyState, muted: r.track?.muted, enabled: r.track?.enabled })),
  }));
});
console.log('LIVE', JSON.stringify(live, null, 2));
process.exit(0);
