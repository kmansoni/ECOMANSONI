// search global state for sfuManager via React fiber
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => /mansoni\.ru/i.test(p.url())) ?? ctx.pages()[0];

const res = await page.evaluate(() => {
  // Walk React fiber to find VideoCallProvider state
  function walk(node, depth = 0, out = []) {
    if (!node || depth > 60 || out.length > 4000) return out;
    if (node.memoizedState) out.push({ depth, type: node.type?.displayName || node.type?.name || (typeof node.type === 'string' ? node.type : '?') });
    if (node.child) walk(node.child, depth + 1, out);
    if (node.sibling) walk(node.sibling, depth, out);
    return out;
  }
  const root = document.getElementById('root');
  const fiberKey = Object.keys(root || {}).find(k => k.startsWith('__reactContainer$'));
  if (!fiberKey) return { err: 'no react root' };
  const container = root[fiberKey];
  const rootFiber = container.stateNode?.current;
  const nodes = walk(rootFiber);
  // collect refs by scanning for `sfuManagerRef` heuristically: look for fibers whose memoizedState.next chain has objects with `recvTransport`/`sendTransport` fields
  function dumpHook(state, dep = 0) {
    if (!state) return null;
    try {
      const cur = state.memoizedState;
      if (cur && typeof cur === 'object') {
        if (cur.current && typeof cur.current === 'object' && ('recvTransport' in cur.current || 'sendTransport' in cur.current)) {
          return cur.current;
        }
      }
    } catch {}
    return state.next ? dumpHook(state.next, dep + 1) : null;
  }
  function findSfu(node) {
    if (!node) return null;
    if (node.memoizedState) {
      const f = dumpHook(node.memoizedState);
      if (f) return f;
    }
    return findSfu(node.child) || findSfu(node.sibling);
  }
  const sfu = findSfu(rootFiber);
  if (!sfu) return { err: 'no sfuManager found' };
  return {
    hasSend: !!sfu.sendTransport,
    sendConn: sfu.sendTransport?.connectionState,
    hasRecv: !!sfu.recvTransport,
    recvConn: sfu.recvTransport?.connectionState,
    recvId: sfu.recvTransport?.id,
    consumersCount: sfu.consumers?.size ?? null,
    consumersList: sfu.consumers ? [...sfu.consumers.entries()].map(([id, c]) => ({
      id, kind: c.kind, paused: c.paused, closed: c.closed, trackId: c.track?.id, trackMuted: c.track?.muted, trackRs: c.track?.readyState
    })) : null,
    producersCount: sfu.producers?.size ?? null,
  };
});
console.log(JSON.stringify(res, null, 2));
process.exit(0);
