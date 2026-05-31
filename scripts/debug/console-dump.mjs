// dump all console output for next 15s
import { chromium } from 'playwright';
import { appendFileSync, writeFileSync } from 'node:fs';
const LOG = 'C:\\Users\\manso\\Desktop\\разработка\\mansoni\\scripts\\debug\\console-dump.log';
writeFileSync(LOG, '');
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => /mansoni\.ru/i.test(p.url())) ?? ctx.pages()[0];
page.on('console', (m) => {
  const line = `[${m.type()}] ${m.text()}\n`;
  process.stdout.write(line);
  appendFileSync(LOG, line);
});
page.on('pageerror', (e) => {
  const line = `[pageerror] ${e.message}\n${e.stack}\n`;
  process.stdout.write(line);
  appendFileSync(LOG, line);
});
await new Promise((r) => setTimeout(r, 15000));
process.exit(0);
