#!/usr/bin/env node
/**
 * Читает OTP из email_otp_codes для указанного email/телефона.
 * Использование: node scripts/read-otp.mjs <email_or_phone>
 */
const SUPA_URL = 'https://lfkbgnbjxskspsownvjm.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxma2JnbmJqeHNrc3Bzb3dudmptIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTQ0MjQ1NiwiZXhwIjoyMDg3MDE4NDU2fQ.1iER4BtwHw9orlT0R-w2gHu0g0MCNDeALOcYFAs58QU';

const input = process.argv[2];
if (!input) {
  console.error('Использование: node scripts/read-otp.mjs <email_or_phone>');
  process.exit(1);
}

async function run() {
  let email = input;

  // Если ввели телефон — ищем email в profiles
  if (/^\+?\d{10,}$/.test(input.replace(/\D/g, ''))) {
    let digits = input.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('8')) digits = '7' + digits.slice(1);
    const candidates = [digits, `+${digits}`];
    const filter = candidates.map(p => `phone.eq.${p}`).join(',');
    const res = await fetch(`${SUPA_URL}/rest/v1/profiles?or=(${filter})&select=email&limit=1`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    const profiles = await res.json();
    if (!profiles[0]?.email) {
      console.error('Профиль с таким телефоном не найден');
      process.exit(1);
    }
    email = profiles[0].email;
    console.log(`Телефон → email: ${email}`);
  }

  const res = await fetch(
    `${SUPA_URL}/rest/v1/email_otp_codes?email=eq.${encodeURIComponent(email)}&order=created_at.desc&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const rows = await res.json();

  if (!rows.length) {
    console.log('OTP не найден. Сначала запросите код в приложении.');
    return;
  }

  const otp = rows[0];
  const expiresIn = Math.round((new Date(otp.expires_at) - Date.now()) / 1000);
  console.log(`\n  OTP код: ${otp.code}`);
  console.log(`  Email: ${otp.email}`);
  console.log(`  Истекает через: ${expiresIn > 0 ? expiresIn + 'с' : 'ИСТЁК'}`);
  console.log(`  Попытки: ${otp.attempts}/5\n`);
}

run().catch(e => console.error(e.message));
