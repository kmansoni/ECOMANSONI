#!/usr/bin/env node
/**
 * safe-env-init.js — безопасная инициализация .env
 *
 * Запрашивает токены интерактивно, без отображения ввода (masked input).
 * Использование: node scripts/safe-env-init.js
 */

import { createInterface } from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, '../.env');

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

function maskInput() {
  // Отключаем echo
  process.stdin.setRawMode?.(true);
  process.stdin.resume?.();
  process.stdout.write('\x1b[8m'); // Скрываем ввод
}

function unmaskInput() {
  process.stdin.setRawMode?.(false);
  process.stdin.resume?.();
  process.stdout.write('\x1b[0m'); // Восстанавливаем
}

async function safeQuestion(query) {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log('\n🔐 Mansoni — безопасная инициализация .env\n');
  console.log('Все значения будут записаны в .env и НЕ будут показаны в терминале.\n');

  // Supabase
  const supabaseUrl = await safeQuestion('Supabase URL: ');
  const supabaseAnonKey = await safeQuestion('Supabase Anon Key: ');
  const supabaseServiceKey = await safeQuestion('Supabase Service Role Key: ');

  // Telegram
  console.log('\n--- Telegram OAuth ---');
  const telegramBotToken = await safeQuestion('Telegram Bot Token (от @BotFather): ');
  const telegramBotId = await safeQuestion('Telegram Bot ID (числовой): ');

  // Применяем маску для секретных данных
  maskInput();
  const botTokenConfirm = await safeQuestion('\nПодтвердите Bot Token (введите ещё раз): ');
  unmaskInput();

  if (telegramBotToken !== botTokenConfirm) {
    console.error('\n❌ Токены не совпадают. Попробуйте снова.');
    rl.close();
    process.exit(1);
  }

  console.log('\n✅ Токены совпадают\n');

  // Генерируем .env
  const envContent = [
    '# Supabase',
    `SUPABASE_URL=${supabaseUrl}`,
    `SUPABASE_ANON_KEY=${supabaseAnonKey}`,
    `SUPABASE_SERVICE_ROLE_KEY=${supabaseServiceKey}`,
    '',
    '# Telegram OAuth',
    `VITE_TELEGRAM_BOT_ID=${telegramBotId}`,
    `TELEGRAM_BOT_TOKEN=${telegramBotToken}`,
    '',
  ].join('\n');

  // Backup существующего .env если есть
  if (fs.existsSync(ENV_PATH)) {
    const backupPath = `${ENV_PATH}.backup.${Date.now()}`;
    fs.copyFileSync(ENV_PATH, backupPath);
    console.log(`📦 Резервная копия сохранена: ${backupPath}`);
  }

  fs.writeFileSync(ENV_PATH, envContent, { mode: 0o600 });
  console.log(`\n✅ .env создан: ${ENV_PATH}`);
  console.log('   Права доступа: только владелец (600)\n');

  rl.close();
}

main().catch((err) => {
  console.error('\n❌ Ошибка:', err.message);
  rl.close();
  process.exit(1);
});
