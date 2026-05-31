const { chromium } = require('playwright');
const https = require('https');

const SUPABASE_URL = 'https://lfkbgnbjxskspsownvjm.supabase.co';
const ANON_KEY = 'sb_publishable_8I_R_P73-7XZ5Rgopqd7yQ_frSWuB5e';
const SUPABASE_PROJECT = 'lfkbgnbjxskspsownvjm';

const accounts = [
  { email: 'test1@mansoni.test', password: 'TestPass123!' },
  { email: 'test2@mansoni.test', password: 'TestPass123!' },
];

async function getTokens(email, password) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ email, password });
    const req = https.request({
      hostname: `${SUPABASE_PROJECT}.supabase.co`,
      path: '/auth/v1/token?grant_type=password',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const opts = {
  headless: false,
  slowMo: 200,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--window-size=900,700',
  ]
};

async function createLoggedInBrowser(position, email, password, label) {
  const tokens = await getTokens(email, password);
  if (!tokens.access_token) throw new Error(`Нет токена для ${email}`);
  console.log(`[${label}] Токен получен`);

  const browser = await chromium.launch({...opts, args: [...opts.args, `--window-position=${position}`]});
  const ctx = await browser.newContext({ permissions: ['camera','microphone'] });
  
  const storageKey = `sb-${SUPABASE_PROJECT}-auth-token`;
  const sessionData = JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expires_at,
    expires_in: tokens.expires_in,
    token_type: tokens.token_type || 'bearer',
    user: tokens.user,
  });
  
  await ctx.addInitScript(([key, val]) => {
    localStorage.setItem(key, val);
  }, [storageKey, sessionData]);
  
  const page = await ctx.newPage();
  
  const errors = [], calls = [];
  page.on('console', msg => {
    const t = msg.text();
    if (msg.type()==='error' && !t.includes('path')) errors.push(t);
    if (/VideoCall|SFU|calls-v2|CONSUMER|TRANSPORT|ACK|bootstrap|E2EE|worker|room|Room|ROOM|callee|caller|answerCall|startCall/i.test(t)) calls.push('['+msg.type()+'] '+t);
  });
  
  await page.goto('https://mansoni.ru', {waitUntil:'domcontentloaded', timeout:30000});
  await page.waitForTimeout(3000);
  console.log(`[${label}] URL: ${page.url()}`);
  
  return { browser, page, errors, calls };
}

(async () => {
  const [b1, b2] = await Promise.all([
    createLoggedInBrowser('0,0', accounts[0].email, accounts[0].password, 'B1'),
    createLoggedInBrowser('920,0', accounts[1].email, accounts[1].password, 'B2'),
  ]);

  console.log('\n=== Оба браузера открыты ===');
  console.log('Браузер 1 (левый): ' + accounts[0].email + ' — ЗВОНЯЩИЙ');
  console.log('Браузер 2 (правый): ' + accounts[1].email + ' — ПРИНИМАЮЩИЙ');
  console.log('Сделай АУДИО звонок. Жду 3 минуты...');

  await b1.page.waitForTimeout(180000);

  console.log('\n=== ОШИБКИ Б1 ==='); b1.errors.forEach(e=>console.log(e));
  console.log('\n=== ОШИБКИ Б2 ==='); b2.errors.forEach(e=>console.log(e));
  console.log('\n=== ЛОГИ ЗВОНКОВ Б1 ==='); b1.calls.slice(0,80).forEach(e=>console.log(e));
  console.log('\n=== ЛОГИ ЗВОНКОВ Б2 ==='); b2.calls.slice(0,80).forEach(e=>console.log(e));

  await b1.browser.close();
  await b2.browser.close();
})();
