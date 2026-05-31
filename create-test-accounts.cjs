const https = require('https');

const SUPABASE_URL = 'https://lfkbgnbjxskspsownvjm.supabase.co';
const ANON_KEY = 'sb_publishable_8I_R_P73-7XZ5Rgopqd7yQ_frSWuB5e';

const accounts = [
  { email: 'test1@mansoni.test', password: 'TestPass123!' },
  { email: 'test2@mansoni.test', password: 'TestPass123!' },
];

async function signUp(email, password) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ email, password });
    const url = new URL(`${SUPABASE_URL}/auth/v1/signup`);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
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
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function signIn(email, password) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ email, password });
    const url = new URL(`${SUPABASE_URL}/auth/v1/token?grant_type=password`);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
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
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  for (const acc of accounts) {
    console.log(`\nРегистрирую ${acc.email}...`);
    const r = await signUp(acc.email, acc.password);
    console.log(`  Статус: ${r.status}`);
    if (r.body.error) console.log(`  Ошибка: ${r.body.error} - ${r.body.msg || r.body.message || ''}`);
    else console.log(`  OK: user_id=${r.body.user?.id || r.body.id || 'n/a'}`);
    
    // Попробуем войти
    const s = await signIn(acc.email, acc.password);
    console.log(`  Вход: ${s.status}`);
    if (s.body.access_token) console.log(`  access_token: ${s.body.access_token.slice(0,30)}...`);
    else console.log(`  Ошибка входа: ${JSON.stringify(s.body).slice(0,200)}`);
  }
})();
