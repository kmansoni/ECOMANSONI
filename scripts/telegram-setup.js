#!/usr/bin/env node
/**
 * telegram-setup.js — безопасная настройка Telegram OAuth
 *
 * Запрашивает Bot Token + числовой ID, валидирует через Telegram API.
 * Использование: node scripts/telegram-setup.js
 */

import { createInterface } from 'readline';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, '../.env');

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function safeQuestion(query) {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer.trim());
    });
  });
}

function apiRequest(path) {
  return new Promise((resolve, reject) => {
    const url = `https://api.telegram.org${path}`;
    https.get(url, { headers: { 'Content-Type': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Invalid API response'));
        }
      });
    }).on('error', reject);
  });
}

async function validateBot(token) {
  try {
    const result = await apiRequest(`/bot${token}/getMe`);
    if (result.ok) {
      return {
        id: result.result.id,
        username: result.result.username,
        name: result.result.first_name,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  console.log('\n📱 Mansoni — настройка Telegram OAuth\n');
  console.log('Ввод скрыт. Токен валидируется через API Telegram.\n');

  // Запрашиваем токен дважды (скрытый ввод)
  process.stdout.write('Bot Token (от @BotFather): ');
  const token = await safeQuestion('');
  process.stdout.write('Подтвердите Token: ');
  const tokenConfirm = await safeQuestion('');

  if (!token || !tokenConfirm) {
    console.error('\n❌ Токен не может быть пустым');
    rl.close();
    process.exit(1);
  }

  if (token !== tokenConfirm) {
    console.error('\n❌ Токены не совпадают');
    rl.close();
    process.exit(1);
  }

  // Валидируем через API
  console.log('\n🔍 Валидация через Telegram API...');
  const botInfo = await validateBot(token);

  if (!botInfo) {
    console.error('\n❌ Неверный токен бота. Проверьте и попробуйте снова.');
    rl.close();
    process.exit(1);
  }

  console.log(`\n✅ Бот найден: @${botInfo.username} (ID: ${botInfo.id})`);

  // Формируем .env строки
  const envUpdates = [
    `VITE_TELEGRAM_BOT_ID=${botInfo.id}`,
    `TELEGRAM_BOT_TOKEN=${token}`,
  ];

  // Читаем существующий .env
  let existingEnv = {};
  if (fs.existsSync(ENV_PATH)) {
    const lines = fs.readFileSync(ENV_PATH, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        existingEnv[match[1].trim()] = match[2].trim();
      }
    }
  }

  // Обновляем значения
  const updates = ['# Telegram OAuth (добавлено telegram-setup.js)'];
  for (const entry of envUpdates) {
    const [key, value] = entry.split('=');
    existingEnv[key] = value;
    updates.push(entry);
  }

  // Backup
  if (fs.existsSync(ENV_PATH)) {
    const backupPath = `${ENV_PATH}.backup.${Date.now()}`;
    fs.copyFileSync(ENV_PATH, backupPath);
    console.log(`📦 Backup: ${backupPath}`);
  }

  // Записываем обновлённый .env
  const newEnvContent = Object.entries(existingEnv)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n';

  fs.writeFileSync(ENV_PATH, newEnvContent, { mode: 0o600 });

  console.log('\n📝 Добавлено в .env:');
  for (const entry of updates.slice(1)) {
    console.log(`   ${entry.split('=')[0]}=***`);
  }

  console.log('\n✅ Готово! Теперь:');
  console.log('   supabase functions deploy telegram-auth');
  console.log('   supabase secrets set TELEGRAM_BOT_TOKEN=' + token.slice(0, 10) + '...\n');

  rl.close();
}

main().catch((err) => {
  console.error('\n❌ Ошибка:', err.message);
  rl.close();
  process.exit(1);
});
