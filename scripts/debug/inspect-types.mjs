// dump fiber types
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => /mansoni\.ru/i.test(p.url())) ?? ctx.pages()[0];
const res = await page.evaluate(() => {
  function* walk(node, d=0){ if(!node||d>80)return; yield {d,n:node}; if(node.child)yield* walk(node.child,d+1); if(node.sibling)yield* walk(node.sibling,d); }
  const root = document.getElementById('root');
  const fk = Object.keys(root).find(k => k.startsWith('__reactContainer$'));
  const rootFiber = root[fk].stateNode.current;
  const types = new Set();
  for (const {n} of walk(rootFiber)) {
    const t = n.type?.displayName || n.type?.name;
    if (t && (/Call|Video|Provider|Sfu|Room|Ws/i.test(t))) types.add(t);
  }
  return [...types];
});
console.log(JSON.stringify(res, null, 2));
process.exit(0);
