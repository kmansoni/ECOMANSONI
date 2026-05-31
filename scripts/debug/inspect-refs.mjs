// Probe: getStableCallsDeviceId, ref values
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => /mansoni\.ru/i.test(p.url())) ?? ctx.pages()[0];
const res = await page.evaluate(() => {
  const out = {};
  out.localStorage = Object.fromEntries(Object.entries(localStorage).filter(([k]) => /device|call|room|user|sup/i.test(k)));
  out.sessionStorage = Object.fromEntries(Object.entries(sessionStorage).filter(([k]) => /device|call|room|user/i.test(k)));
  // walk fiber for refs callsWsRoomRef, callsWsMediaRoomRef
  function* walk(node, depth = 0) {
    if (!node || depth > 60) return;
    yield node;
    if (node.child) yield* walk(node.child, depth + 1);
    if (node.sibling) yield* walk(node.sibling, depth);
  }
  const root = document.getElementById('root');
  const fk = Object.keys(root).find(k => k.startsWith('__reactContainer$'));
  const rootFiber = root[fk].stateNode.current;
  let videoCallProvider = null;
  for (const n of walk(rootFiber)) {
    const tn = n.type?.displayName || n.type?.name;
    if (tn && /VideoCallProvider/.test(tn)) { videoCallProvider = n; break; }
  }
  if (!videoCallProvider) return { err: 'no provider' };
  // dump all refs
  const refs = {};
  let state = videoCallProvider.memoizedState;
  let i = 0;
  while (state) {
    if (state.memoizedState && typeof state.memoizedState === 'object' && 'current' in state.memoizedState) {
      const v = state.memoizedState.current;
      if (typeof v === 'string') refs['hook#' + i + ':string'] = v;
      else if (v && typeof v === 'object') refs['hook#' + i + ':obj'] = Object.keys(v).slice(0, 8).join(',');
    }
    state = state.next;
    i++;
  }
  out.refs = refs;
  return out;
});
console.log(JSON.stringify(res, null, 2));
process.exit(0);
